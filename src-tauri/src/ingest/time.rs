use chrono::{DateTime, Utc};

const MICROS_PER_SECOND: f64 = 1_000_000.0;

/// RFC 3339 with or without fractional seconds.
pub fn parse_rfc3339(value: Option<&str>) -> Option<DateTime<Utc>> {
    value
        .and_then(|v| DateTime::parse_from_rfc3339(v.trim()).ok())
        .map(|d| d.with_timezone(&Utc))
}

/// Unix seconds as a float (ChatGPT exports), kept to microsecond precision.
pub fn from_unix_float(value: Option<f64>) -> Option<DateTime<Utc>> {
    value
        .filter(|v| v.is_finite() && *v > 0.0)
        .and_then(|v| DateTime::from_timestamp_micros((v * MICROS_PER_SECOND).round() as i64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rfc3339_variants() {
        assert_eq!(
            parse_rfc3339(Some("2026-07-25T09:38:55.311455Z"))
                .unwrap()
                .timestamp_subsec_micros(),
            311_455
        );
        assert!(parse_rfc3339(Some("2026-07-25T09:38:55Z")).is_some());
        assert!(parse_rfc3339(Some("2026-07-25T09:38:55+02:00")).is_some());
        assert!(parse_rfc3339(Some("yesterday")).is_none());
        assert!(parse_rfc3339(None).is_none());
    }

    #[test]
    fn converts_unix_floats_and_rejects_nonsense() {
        assert_eq!(
            from_unix_float(Some(1_724_000_010.25))
                .unwrap()
                .timestamp_micros(),
            1_724_000_010_250_000
        );
        assert!(from_unix_float(Some(f64::NAN)).is_none());
        assert!(from_unix_float(Some(0.0)).is_none());
        assert!(from_unix_float(None).is_none());
    }
}
