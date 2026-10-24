//! Gemini live capture: the browser extension posts the turns it can see to a listener
//! on 127.0.0.1, and they are stored as `gemini` conversations.

pub mod limits;
pub mod merge;
pub mod payload;
pub mod server;
pub mod service;
pub mod store;
pub mod token;
