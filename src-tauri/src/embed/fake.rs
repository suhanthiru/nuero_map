//! Deterministic embedder for tests: texts that share words get similar vectors, so
//! topic assignment behaves realistically without loading a model.

use sha2::{Digest, Sha256};

use super::{normalize, Embedder, DIMS};
use crate::error::AppResult;

#[derive(Default)]
pub struct FakeEmbedder;

fn word_vector(word: &str) -> Vec<f32> {
    let digest = Sha256::digest(word.as_bytes());
    (0..DIMS)
        .map(|i| {
            let byte = digest[i % digest.len()] ^ (i as u8).wrapping_mul(31);
            (f32::from(byte) / 127.5) - 1.0
        })
        .collect()
}

/// Bag of words: the vector is the normalized sum of per-word vectors.
pub fn fake_embedding(text: &str) -> Vec<f32> {
    let mut sum = vec![0.0_f32; DIMS];
    for word in text
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 2)
        .map(str::to_lowercase)
    {
        for (s, w) in sum.iter_mut().zip(word_vector(&word)) {
            *s += w;
        }
    }
    normalize(&sum)
}

impl Embedder for FakeEmbedder {
    fn embed(&self, texts: &[String]) -> AppResult<Vec<Vec<f32>>> {
        Ok(texts.iter().map(|t| fake_embedding(t)).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::embed::cosine;

    #[test]
    fn shared_words_mean_similar_vectors() {
        let a = fake_embedding("robot arm servo jitter");
        let b = fake_embedding("robot arm inverse kinematics");
        let c = fake_embedding("sourdough bread recipe");

        assert!(cosine(&a, &b) > cosine(&a, &c));
        assert_eq!(a.len(), DIMS);
    }
}
