pub mod app_state;
pub mod capture;
pub mod commands;
pub mod config;
pub mod db;
pub mod embed;
pub mod error;
pub mod events;
pub mod extract;
pub mod graph;
pub mod ingest;
pub mod jobs;
pub mod llm;
pub mod review;
pub mod secrets;
pub mod settings;
pub mod topics;
pub mod vault;

use std::sync::Arc;

use tauri::Manager;
use tracing_subscriber::EnvFilter;

use app_state::AppState;
use capture::service::CaptureService;
use capture::token::{CaptureToken, TOKEN_ACCOUNT};
use events::{EventSink, TauriSink};
use jobs::handlers::JobContext;
use jobs::worker::Worker;

const DEFAULT_LOG_FILTER: &str = "neural_map_lib=info,warn";

fn init_tracing() {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_LOG_FILTER));
    // A second init (e.g. in tests) is harmless; ignore the error.
    let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
}

/// Focus the existing window when the user launches the app a second time.
fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    tracing::info!(dir = %data_dir.display(), "opening app data");
    let runtime = tauri::async_runtime::handle().inner().clone();
    let state = AppState::open(&data_dir, runtime)?;
    match state.db.call_blocking(review::flow::requeue_unfinished) {
        Ok(0) => {}
        Ok(n) => tracing::info!(reviews = n, "requeued unfinished weekly reviews"),
        Err(e) => tracing::warn!(error = %e, "could not check for unfinished weekly reviews"),
    }
    let sink: Arc<dyn EventSink> = Arc::new(TauriSink(app.handle().clone()));
    let ctx = JobContext {
        db: state.db.clone(),
        sink: sink.clone(),
        llm: state.llm.clone(),
        keys: state.keys.clone(),
        embedder: state.embedder.clone(),
    };
    let worker = Arc::new(Worker::new(ctx, state.jobs.clone()));
    tauri::async_runtime::spawn(worker.run());
    start_capture(app, &state, sink);
    app.manage(state);
    Ok(())
}

/// The Gemini capture listener, started in the background if the user turned it on.
fn start_capture(app: &mut tauri::App, state: &AppState, sink: Arc<dyn EventSink>) {
    let token = CaptureToken::new(Arc::new(secrets::KeyringStore::for_account(TOKEN_ACCOUNT)));
    let capture = Arc::new(CaptureService::new(state.db.clone(), sink, Arc::new(token)));
    match state.db.call_blocking(|c| settings::load(c, false, false)) {
        Ok(s) if s.capture_enabled => {
            let starting = capture.clone();
            tauri::async_runtime::spawn(async move {
                starting.reconfigure(true, s.capture_port).await;
            });
        }
        Ok(_) => {}
        Err(e) => tracing::warn!(error = %e, "could not read capture settings"),
    }
    app.manage(capture);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();
    tauri::Builder::default()
        // Must be registered first: one process owns the database and the capture port.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app)
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            commands::capture::get_capture_config,
            commands::capture::regenerate_capture_token,
            commands::import::estimate_import,
            commands::import::import_export_zip,
            commands::jobs::list_jobs,
            commands::jobs::cancel_job,
            commands::jobs::retry_job,
            commands::review::list_review_weeks,
            commands::review::start_review,
            commands::review::get_review,
            commands::review::save_review_answer,
            commands::review::submit_review,
            commands::settings::get_settings,
            commands::settings::set_settings,
            commands::settings::set_api_key,
            commands::settings::clear_api_key,
            commands::settings::test_api_key,
            commands::settings::run_extraction,
            commands::source::get_source_context,
            commands::topics::list_topics,
            commands::topics::get_topic_page,
            commands::topics::record_topic_opened,
            commands::topics::set_topic_state,
            commands::topics::rename_topic,
            commands::topics::get_topic_note,
            commands::topics::save_topic_note,
            commands::topics::get_unlinked_mentions,
            commands::topics::pin_gem,
            commands::topics::unpin_gem,
            commands::topics::get_graph,
            commands::topics::get_edge_evidence,
            commands::topics::get_today_shelf,
            commands::topics::search,
            commands::topics::regenerate_synthesis,
            commands::topics::list_merge_suggestions,
            commands::vault::get_vault,
            commands::vault::create_folder,
            commands::vault::rename_folder,
            commands::vault::move_folder,
            commands::vault::delete_folder,
            commands::vault::create_note,
            commands::vault::get_note,
            commands::vault::save_note,
            commands::vault::rename_note,
            commands::vault::move_note,
            commands::vault::delete_note,
            commands::vault::import_documents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
