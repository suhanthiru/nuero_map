//! The pairing token the extension sends as a bearer token, and the health proof that
//! lets the extension check it is talking to this app before it sends the token.

use std::sync::Arc;

use rand::Rng;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::error::AppResult;
use crate::ingest::fingerprint::hex;
use crate::secrets::ApiKeyStore;

/// Credential-store account the token is kept under.
pub const TOKEN_ACCOUNT: &str = "capture_token";
const TOKEN_BYTES: usize = 32;
const PROOF_LABEL: &str = "nm-health-v1";
const HMAC_BLOCK: usize = 64;

/// Wraps the store the token lives in (the OS keychain in the app).
pub struct CaptureToken {
    store: Arc<dyn ApiKeyStore>,
}

impl CaptureToken {
    pub fn new(store: Arc<dyn ApiKeyStore>) -> Self {
        Self { store }
    }

    /// The token, created and stored the first time it is needed.
    pub fn get_or_create(&self) -> AppResult<String> {
        match self.store.get()? {
            Some(token) => Ok(token),
            None => self.rotate(),
        }
    }

    /// A new token; the old one stops working at once.
    pub fn rotate(&self) -> AppResult<String> {
        let token = generate();
        self.store.set(&token)?;
        Ok(token)
    }

    /// Constant-time check of a presented token. False when none is stored.
    pub fn verify(&self, presented: &str) -> bool {
        match self.store.get() {
            Ok(Some(token)) => token.as_bytes().ct_eq(presented.as_bytes()).into(),
            _ => false,
        }
    }
}

/// 32 random bytes as lowercase hex.
pub fn generate() -> String {
    let mut bytes = [0u8; TOKEN_BYTES];
    rand::rng().fill_bytes(&mut bytes);
    hex(&bytes)
}

/// HMAC-SHA256 (RFC 2104).
pub fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut block = [0u8; HMAC_BLOCK];
    if key.len() > HMAC_BLOCK {
        block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    let pad = |byte: u8| block.map(|b| b ^ byte);
    let inner = Sha256::new()
        .chain_update(pad(0x36))
        .chain_update(message)
        .finalize();
    Sha256::new()
        .chain_update(pad(0x5c))
        .chain_update(inner)
        .finalize()
        .into()
}

/// What `/health` returns for `nonce`: proves the listener on `port` knows the token
/// without revealing it. The key is the token string itself (as pasted), not decoded.
pub fn health_proof(token: &str, nonce: &str, port: u16) -> String {
    let message = format!("{PROOF_LABEL}\n{nonce}\n{port}");
    hex(&hmac_sha256(token.as_bytes(), message.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::MemoryStore;

    #[test]
    fn hmac_matches_rfc_4231_vectors() {
        // Test case 1.
        assert_eq!(
            hex(&hmac_sha256(&[0x0b; 20], b"Hi There")),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
        // Test case 2.
        assert_eq!(
            hex(&hmac_sha256(b"Jefe", b"what do ya want for nothing?")),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        // Test case 6: a key longer than the block is hashed first.
        assert_eq!(
            hex(&hmac_sha256(
                &[0xaa; 131],
                b"Test Using Larger Than Block-Size Key - Hash Key First"
            )),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
    }

    #[test]
    fn tokens_are_64_hex_chars_and_differ() {
        let (a, b) = (generate(), generate());
        assert_eq!(a.len(), 64);
        assert!(a.bytes().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn verify_accepts_only_the_current_token() {
        let token = CaptureToken::new(Arc::new(MemoryStore::default()));
        assert!(!token.verify(""), "nothing stored yet");

        let first = token.get_or_create().unwrap();
        assert_eq!(token.get_or_create().unwrap(), first, "created once");
        assert!(token.verify(&first));
        assert!(!token.verify(&first[..63]));

        let second = token.rotate().unwrap();
        assert!(!token.verify(&first));
        assert!(token.verify(&second));
    }

    #[test]
    fn the_health_proof_is_bound_to_nonce_and_port() {
        // Shared vector: the extension's tests check the same value with crypto.subtle.
        let token = "0123456789abcdef".repeat(4);
        assert_eq!(
            health_proof(&token, "nonce-0123456789", 47831),
            "b3feed801592d7ca279d3d88e70f672d50633129812c9eea7412bbf9f292f468"
        );
        let proof = health_proof("tok", "nonce-0123456789", 47831);
        assert_eq!(proof.len(), 64);
        assert_ne!(proof, health_proof("tok", "nonce-0123456789", 47832));
        assert_ne!(proof, health_proof("tok", "nonce-9876543210", 47831));
        assert_ne!(proof, health_proof("other", "nonce-0123456789", 47831));
    }
}
