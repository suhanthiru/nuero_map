//! Local text embeddings (no API key). The app uses fastembed with bge-small-en-v1.5;
//! tests use a deterministic fake.

pub mod fake;
pub mod local;

use crate::error::AppResult;

pub const DIMS: usize = 384;

pub trait Embedder: Send + Sync {
    /// One unit-length vector per input text, in order.
    fn embed(&self, texts: &[String]) -> AppResult<Vec<Vec<f32>>>;
}

pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 {
        0.0
    } else {
        dot / (na * nb)
    }
}

pub fn normalize(v: &[f32]) -> Vec<f32> {
    let n: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if n == 0.0 {
        v.to_vec()
    } else {
        v.iter().map(|x| x / n).collect()
    }
}

pub fn to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|x| x.to_le_bytes()).collect()
}

pub fn from_blob(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blob_round_trips_and_cosine_behaves() {
        let v = vec![0.5_f32, -1.0, 2.0];
        assert_eq!(from_blob(&to_blob(&v)), v);
        assert!((cosine(&v, &v) - 1.0).abs() < 1e-6);
        assert_eq!(cosine(&v, &[0.0, 0.0, 0.0]), 0.0);
        assert!((normalize(&[3.0, 4.0])[0] - 0.6).abs() < 1e-6);
    }
}
