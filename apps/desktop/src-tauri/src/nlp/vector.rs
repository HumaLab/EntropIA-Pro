//! Shared helpers for embedding vectors stored as little-endian f32 blobs.
//!
//! Used by the asset-similarity commands (`nlp::commands`) and the RAG
//! retrieval pipeline.

/// Decode an embedding blob (f32 little-endian) into a vector.
pub(crate) fn decode_embedding_blob(blob: &[u8]) -> Result<Vec<f32>, String> {
    if blob.len() % 4 != 0 {
        return Err(format!(
            "Embedding blob has invalid size: {} bytes (not divisible by 4)",
            blob.len()
        ));
    }

    Ok(blob
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
        .collect())
}

/// Compute cosine distance (1 - cosine_similarity) between two f32 vectors.
/// Returns None if either vector has zero magnitude.
pub(crate) fn cosine_distance(a: &[f32], b: &[f32]) -> Option<f64> {
    if a.len() != b.len() || a.is_empty() {
        return None;
    }

    let mut dot = 0.0_f64;
    let mut mag_a = 0.0_f64;
    let mut mag_b = 0.0_f64;

    for (ai, bi) in a.iter().zip(b.iter()) {
        let ai = *ai as f64;
        let bi = *bi as f64;
        dot += ai * bi;
        mag_a += ai * ai;
        mag_b += bi * bi;
    }

    let mag_a = mag_a.sqrt();
    let mag_b = mag_b.sqrt();

    if mag_a == 0.0 || mag_b == 0.0 {
        return None;
    }

    Some(1.0 - dot / (mag_a * mag_b))
}
