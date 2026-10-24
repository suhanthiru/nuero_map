use std::path::Path;
use std::sync::Arc;

use crate::db::Db;
use crate::embed::local::LocalEmbedder;
use crate::embed::Embedder;
use crate::error::AppResult;
use crate::jobs::JobHandle;
use crate::llm::http::AnthropicHttp;
use crate::llm::LlmClient;
use crate::secrets::{ApiKeyStore, KeyringStore};

const DB_FILE: &str = "neural_map.sqlite";
const MODELS_DIR: &str = "models";

/// Shared services, managed by Tauri and injected into commands.
pub struct AppState {
    pub db: Db,
    pub jobs: JobHandle,
    pub keys: Arc<dyn ApiKeyStore>,
    pub llm: Arc<dyn LlmClient>,
    pub embedder: Arc<dyn Embedder>,
    pub local_embedder: Arc<LocalEmbedder>,
}

impl AppState {
    pub fn open(data_dir: &Path, runtime: tokio::runtime::Handle) -> AppResult<Self> {
        std::fs::create_dir_all(data_dir)?;
        let db = Db::open(&data_dir.join(DB_FILE))?;
        let keys: Arc<dyn ApiKeyStore> = Arc::new(KeyringStore::default());
        let llm: Arc<dyn LlmClient> = Arc::new(AnthropicHttp::new(keys.clone(), runtime)?);
        let local_embedder = Arc::new(LocalEmbedder::new(data_dir.join(MODELS_DIR)));
        Ok(Self {
            db,
            jobs: JobHandle::default(),
            keys,
            llm,
            embedder: local_embedder.clone(),
            local_embedder,
        })
    }
}
