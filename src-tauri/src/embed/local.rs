//! fastembed (ONNX Runtime, statically linked). The model downloads once into the app
//! data folder on first use (~130 MB) and is loaded lazily.

use std::path::PathBuf;
use std::sync::Mutex;

use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};

use super::{normalize, Embedder};
use crate::error::{AppError, AppResult};

const BATCH_SIZE: usize = 64;

pub struct LocalEmbedder {
    cache_dir: PathBuf,
    model: Mutex<Option<TextEmbedding>>,
}

impl LocalEmbedder {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache_dir,
            model: Mutex::new(None),
        }
    }

    /// Whether the model files are already on disk (so first use won't download).
    pub fn is_downloaded(&self) -> bool {
        std::fs::read_dir(&self.cache_dir)
            .map(|mut entries| entries.next().is_some())
            .unwrap_or(false)
    }
}

fn model_error(e: impl std::fmt::Display) -> AppError {
    AppError::Embedding(e.to_string())
}

impl Embedder for LocalEmbedder {
    fn embed(&self, texts: &[String]) -> AppResult<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        let mut guard = self
            .model
            .lock()
            .map_err(|_| AppError::internal("embedder lock poisoned"))?;
        if guard.is_none() {
            std::fs::create_dir_all(&self.cache_dir)?;
            let options = TextInitOptions::new(EmbeddingModel::BGESmallENV15)
                .with_cache_dir(self.cache_dir.clone());
            *guard = Some(TextEmbedding::try_new(options).map_err(model_error)?);
        }
        let model = guard
            .as_mut()
            .ok_or_else(|| AppError::internal("embedder not loaded"))?;
        let vectors = model.embed(texts, Some(BATCH_SIZE)).map_err(model_error)?;
        Ok(vectors.iter().map(|v| normalize(v)).collect())
    }
}
