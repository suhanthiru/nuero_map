//! Runs the capture listener and moves it when settings change. It binds 127.0.0.1
//! only and never falls back to another port on its own: if the port is taken, the
//! status says so and the user picks another (which changes the pairing string).

use std::io::ErrorKind;
use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;

use super::limits::Limits;
use super::server::{router, ServerState};
use super::token::CaptureToken;
use crate::config::capture::{BIND_RETRIES, BIND_RETRY_MS, SHUTDOWN_WAIT_MS};
use crate::db::Db;
use crate::events::EventSink;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub listening: bool,
    pub port: u16,
    /// Why it isn't listening although enabled (e.g. the port is in use).
    pub error: Option<String>,
}

struct Running {
    port: u16,
    shutdown: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

pub struct CaptureService {
    db: Db,
    sink: Arc<dyn EventSink>,
    token: Arc<CaptureToken>,
    running: Mutex<Option<Running>>,
    status: RwLock<CaptureStatus>,
}

impl CaptureService {
    pub fn new(db: Db, sink: Arc<dyn EventSink>, token: Arc<CaptureToken>) -> Self {
        Self {
            db,
            sink,
            token,
            running: Mutex::new(None),
            status: RwLock::new(CaptureStatus {
                listening: false,
                port: 0,
                error: None,
            }),
        }
    }

    pub fn token(&self) -> &CaptureToken {
        &self.token
    }

    pub fn status(&self) -> CaptureStatus {
        self.status.read().map(|s| s.clone()).unwrap_or(CaptureStatus {
            listening: false,
            port: 0,
            error: Some("capture status unavailable".into()),
        })
    }

    fn set_status(&self, status: CaptureStatus) -> CaptureStatus {
        if let Ok(mut s) = self.status.write() {
            *s = status.clone();
        }
        status
    }

    /// Starts, stops or moves the listener to match the settings. Port 0 picks a free
    /// port (tests).
    pub async fn reconfigure(&self, enabled: bool, port: u16) -> CaptureStatus {
        let mut running = self.running.lock().await;
        if let Some(r) = running.as_ref() {
            if enabled && (port == 0 || r.port == port) && !r.task.is_finished() {
                return self.status();
            }
        }
        if let Some(r) = running.take() {
            stop(r).await;
        }
        if !enabled {
            return self.set_status(CaptureStatus {
                listening: false,
                port,
                error: None,
            });
        }
        let listener = match bind(port).await {
            Ok(l) => l,
            Err(e) => {
                tracing::warn!(port, error = %e, "capture listener could not bind");
                let error = if e.kind() == ErrorKind::AddrInUse {
                    format!("Port {port} is in use by another program")
                } else {
                    format!("Could not listen on port {port}")
                };
                return self.set_status(CaptureStatus {
                    listening: false,
                    port,
                    error: Some(error),
                });
            }
        };
        let bound = listener.local_addr().map_or(port, |a| a.port());
        if let Err(e) = self.token.get_or_create() {
            tracing::error!(code = e.code(), "capture token unavailable");
            return self.set_status(CaptureStatus {
                listening: false,
                port: bound,
                error: Some("The pairing token is unavailable".into()),
            });
        }
        let state = ServerState {
            db: self.db.clone(),
            sink: self.sink.clone(),
            token: self.token.clone(),
            port: bound,
            limits: Arc::new(Limits::default()),
        };
        let (shutdown, signal) = oneshot::channel();
        let task = tokio::spawn(async move {
            let serve = axum::serve(listener, router(state)).with_graceful_shutdown(async {
                let _ = signal.await;
            });
            if let Err(e) = serve.await {
                tracing::error!(error = %e, "capture listener stopped");
            }
        });
        tracing::info!(port = bound, "capture listener started");
        *running = Some(Running {
            port: bound,
            shutdown,
            task,
        });
        self.set_status(CaptureStatus {
            listening: true,
            port: bound,
            error: None,
        })
    }
}

async fn bind(port: u16) -> std::io::Result<TcpListener> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut attempt = 0;
    loop {
        match TcpListener::bind(addr).await {
            Err(e) if e.kind() == ErrorKind::AddrInUse && attempt < BIND_RETRIES => {
                attempt += 1;
                tokio::time::sleep(Duration::from_millis(BIND_RETRY_MS)).await;
            }
            result => return result,
        }
    }
}

/// Signals the server to finish and waits a little for its socket to close; a server
/// that doesn't finish in time is aborted.
async fn stop(running: Running) {
    let Running {
        port,
        shutdown,
        mut task,
    } = running;
    let _ = shutdown.send(());
    let wait = Duration::from_millis(SHUTDOWN_WAIT_MS);
    if tokio::time::timeout(wait, &mut task).await.is_err() {
        tracing::warn!(port, "capture listener slow to stop; aborting it");
        task.abort();
    }
}
