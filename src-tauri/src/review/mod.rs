//! The weekly review. At the end of a week, Claude writes a test (multiple choice and
//! free response) from that week's ideas; the answers are graded and turned into a
//! study guide aimed at what didn't stick.
//!
//! Flow: `start` snapshots the week's material and queues `ReviewGenerate`; answers are
//! saved as they're typed; `submit` scores multiple choice locally and queues
//! `ReviewGrade`, which grades free responses and writes the guide.

pub mod dto;
pub mod flow;
pub mod generate;
pub mod grade;
pub mod material;
pub mod prompt;
pub mod week;

use crate::error::AppError;

/// Text shown on a review when a step fails for good.
pub fn failure_message(error: &AppError) -> String {
    match error {
        AppError::NoApiKey => "Add your Anthropic API key in Settings, then try again.".into(),
        AppError::InvalidApiKey => "Anthropic rejected the API key. Check it in Settings.".into(),
        AppError::Refused(category) => {
            format!("Claude declined to write this (safety filter: {category}). Try another week.")
        }
        AppError::Cancelled => "Stopped before it finished.".into(),
        AppError::Network(_) => {
            "Couldn't reach Anthropic. Check your connection and try again.".into()
        }
        other => format!("Something went wrong: {other}"),
    }
}
