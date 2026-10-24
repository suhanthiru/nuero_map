//! Request limits for the capture listener: one token bucket for everything, a cap on
//! requests in flight, and a brake on clients that keep rewriting one conversation.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::{OwnedSemaphorePermit, Semaphore};

use crate::config::capture::{
    BRANCH_CHANGE_LIMIT, BRANCH_CHANGE_WINDOW_SECS, MAX_IN_FLIGHT, RATE_BURST, RATE_PER_SEC,
};

struct Bucket {
    tokens: f64,
    at: Instant,
}

pub struct Limits {
    bucket: Mutex<Bucket>,
    in_flight: Arc<Semaphore>,
    branch_changes: Mutex<HashMap<String, VecDeque<Instant>>>,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            bucket: Mutex::new(Bucket {
                tokens: RATE_BURST,
                at: Instant::now(),
            }),
            in_flight: Arc::new(Semaphore::new(MAX_IN_FLIGHT)),
            branch_changes: Mutex::new(HashMap::new()),
        }
    }
}

impl Limits {
    /// Takes one request's token; false when the bucket is empty.
    pub fn allow(&self) -> bool {
        let Ok(mut b) = self.bucket.lock() else {
            return false;
        };
        let now = Instant::now();
        let refill = now.duration_since(b.at).as_secs_f64() * RATE_PER_SEC;
        b.tokens = (b.tokens + refill).min(RATE_BURST);
        b.at = now;
        if b.tokens < 1.0 {
            return false;
        }
        b.tokens -= 1.0;
        true
    }

    /// A slot for one request; None when MAX_IN_FLIGHT are already running.
    pub fn slot(&self) -> Option<OwnedSemaphorePermit> {
        self.in_flight.clone().try_acquire_owned().ok()
    }

    /// Whether `conversation` already had BRANCH_CHANGE_LIMIT rewrites in the window.
    pub fn flapping(&self, conversation: &str) -> bool {
        let Ok(mut map) = self.branch_changes.lock() else {
            return false;
        };
        let window = Duration::from_secs(BRANCH_CHANGE_WINDOW_SECS);
        let now = Instant::now();
        map.retain(|_, times| {
            while times.front().is_some_and(|t| now.duration_since(*t) > window) {
                times.pop_front();
            }
            !times.is_empty()
        });
        map.get(conversation)
            .is_some_and(|times| times.len() >= BRANCH_CHANGE_LIMIT)
    }

    pub fn record_branch_change(&self, conversation: &str) {
        if let Ok(mut map) = self.branch_changes.lock() {
            map.entry(conversation.to_owned())
                .or_default()
                .push_back(Instant::now());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bucket_allows_a_burst_then_refuses() {
        let limits = Limits::default();
        let allowed = (0..(RATE_BURST as usize + 5)).filter(|_| limits.allow()).count();
        assert_eq!(allowed, RATE_BURST as usize);
    }

    #[test]
    fn in_flight_slots_are_capped_and_returned() {
        let limits = Limits::default();
        let held: Vec<_> = (0..MAX_IN_FLIGHT).filter_map(|_| limits.slot()).collect();
        assert_eq!(held.len(), MAX_IN_FLIGHT);
        assert!(limits.slot().is_none());
        drop(held);
        assert!(limits.slot().is_some());
    }

    #[test]
    fn a_conversation_rewritten_too_often_is_flapping() {
        let limits = Limits::default();
        for _ in 0..BRANCH_CHANGE_LIMIT {
            assert!(!limits.flapping("c1"));
            limits.record_branch_change("c1");
        }
        assert!(limits.flapping("c1"));
        assert!(!limits.flapping("c2"));
    }
}
