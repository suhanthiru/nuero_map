//! Streams a top-level JSON array one element at a time, so a 1 GB export never has to
//! fit in memory: peak usage is bounded by the largest single conversation.

use std::fmt;
use std::io::{BufReader, Read};
use std::ops::ControlFlow;

use serde::de::{Deserializer, SeqAccess, Visitor};
use serde_json::value::RawValue;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Streamed {
    pub count: usize,
    /// The callback asked to stop before the end of the array.
    pub stopped: bool,
}

struct ElementVisitor<F>(F);

impl<'de, F> Visitor<'de> for ElementVisitor<F>
where
    F: FnMut(Box<RawValue>) -> ControlFlow<()>,
{
    type Value = Streamed;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("a JSON array of conversations")
    }

    fn visit_seq<A: SeqAccess<'de>>(mut self, mut seq: A) -> Result<Streamed, A::Error> {
        let mut count = 0;
        while let Some(raw) = seq.next_element::<Box<RawValue>>()? {
            count += 1;
            if (self.0)(raw).is_break() {
                return Ok(Streamed {
                    count,
                    stopped: true,
                });
            }
        }
        Ok(Streamed {
            count,
            stopped: false,
        })
    }
}

/// Calls `on_element` with each raw array element until it returns `Break`.
/// Elements are handed over unparsed so one malformed record can fail on its own.
pub fn for_each_element<R: Read>(
    reader: R,
    on_element: impl FnMut(Box<RawValue>) -> ControlFlow<()>,
) -> Result<Streamed, serde_json::Error> {
    let mut de = serde_json::Deserializer::from_reader(BufReader::new(reader));
    let mut stopped_at = None;
    let mut wrapped = on_element;
    let mut counting = |raw: Box<RawValue>| {
        let flow = wrapped(raw);
        if flow.is_break() {
            stopped_at = Some(());
        }
        flow
    };
    match (&mut de).deserialize_seq(ElementVisitor(&mut counting)) {
        Ok(streamed) if streamed.stopped => Ok(streamed),
        Ok(streamed) => de.end().map(|_| streamed),
        // Stopping early leaves the array unterminated, which serde reports as an error.
        Err(_) if stopped_at.is_some() => Ok(Streamed {
            count: 0,
            stopped: true,
        }),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn yields_each_element_raw() {
        let mut seen = Vec::new();

        let out = for_each_element(r#"[{"a":1}, [2], "x"]"#.as_bytes(), |raw| {
            seen.push(raw.get().to_owned());
            ControlFlow::Continue(())
        })
        .unwrap();

        assert_eq!(
            out,
            Streamed {
                count: 3,
                stopped: false
            }
        );
        assert_eq!(seen, [r#"{"a":1}"#, "[2]", r#""x""#]);
    }

    #[test]
    fn stops_early_when_asked() {
        let mut seen = 0;

        let out = for_each_element("[1, 2, 3, 4]".as_bytes(), |_| {
            seen += 1;
            if seen == 2 {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        })
        .unwrap();

        assert!(out.stopped);
        assert_eq!(seen, 2);
    }

    #[test]
    fn rejects_non_arrays_and_trailing_garbage() {
        let go = |_| ControlFlow::Continue(());
        assert!(for_each_element(r#"{"a":1}"#.as_bytes(), go).is_err());
        assert!(for_each_element("[1] [2]".as_bytes(), go).is_err());
    }
}
