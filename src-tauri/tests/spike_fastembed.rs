//! Phase-0 spike: fastembed loads bge-small-en-v1.5 with static ONNX Runtime on Windows.
//! Downloads the model (~130 MB) on first run, so it is ignored by default:
//! `cargo test --test spike_fastembed -- --ignored`

use fastembed::{EmbeddingModel, TextEmbedding, TextInitOptions};

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    dot / (na * nb)
}

#[test]
#[ignore = "downloads the embedding model"]
fn bge_small_embeds_and_ranks_related_text_higher() {
    let cache = std::env::temp_dir().join("neural_map_fastembed_spike");
    let mut model = TextEmbedding::try_new(
        TextInitOptions::new(EmbeddingModel::BGESmallENV15).with_cache_dir(cache),
    )
    .expect("model init");

    let docs = [
        "decay score with a half-life for fading ideas",
        "ideas fade over time unless revisited",
        "recipe for sourdough bread",
    ];
    let v = model.embed(docs, None).expect("embed");
    assert_eq!(v.len(), 3);
    assert_eq!(v[0].len(), 384);
    assert!(cosine(&v[0], &v[1]) > cosine(&v[0], &v[2]));
}
