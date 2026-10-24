//! Review weeks run Monday to Sunday in the user's local time (the backend runs on their
//! machine, so `chrono::Local` is their time zone). Stored timestamps are UTC.

use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveTime, TimeZone, Utc};

use crate::error::{AppError, AppResult};

pub const DATE_FORMAT: &str = "%Y-%m-%d";

/// Monday of the week containing `day`.
pub fn monday_of(day: NaiveDate) -> NaiveDate {
    day - Duration::days(i64::from(day.weekday().num_days_from_monday()))
}

/// Parses "YYYY-MM-DD" and snaps it to that week's Monday.
pub fn parse_week(raw: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(raw.trim(), DATE_FORMAT)
        .map(monday_of)
        .map_err(|_| AppError::InvalidInput(format!("not a date: {raw}")))
}

/// Local midnight as UTC. Where a DST change skips midnight, the first instant after it.
fn local_midnight<Tz: TimeZone>(tz: &Tz, day: NaiveDate) -> AppResult<DateTime<Utc>> {
    let midnight = day.and_time(NaiveTime::MIN);
    tz.from_local_datetime(&midnight)
        .earliest()
        .or_else(|| {
            tz.from_local_datetime(&(midnight + Duration::hours(1)))
                .earliest()
        })
        .map(|t| t.with_timezone(&Utc))
        .ok_or_else(|| AppError::InvalidInput(format!("no local midnight on {day}")))
}

/// The week starting on `monday`, as a half-open UTC range.
pub fn bounds<Tz: TimeZone>(
    tz: &Tz,
    monday: NaiveDate,
) -> AppResult<(DateTime<Utc>, DateTime<Utc>)> {
    Ok((
        local_midnight(tz, monday)?,
        local_midnight(tz, monday + Duration::days(7))?,
    ))
}

/// Mondays of the current week and the `count - 1` before it, newest first.
pub fn recent_mondays(today: NaiveDate, count: i64) -> Vec<NaiveDate> {
    let this_week = monday_of(today);
    (0..count.max(1))
        .map(|back| this_week - Duration::weeks(back))
        .collect()
}

/// The Sunday a week ends on, for display.
pub fn last_day(monday: NaiveDate) -> NaiveDate {
    monday + Duration::days(6)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, DATE_FORMAT).unwrap()
    }

    #[test]
    fn snaps_any_day_to_its_monday() {
        assert_eq!(monday_of(d("2026-10-20")), d("2026-10-19"));
        assert_eq!(monday_of(d("2026-10-19")), d("2026-10-19"));
        assert_eq!(monday_of(d("2026-10-25")), d("2026-10-19"));
        assert_eq!(parse_week("2026-10-22").unwrap(), d("2026-10-19"));
        assert_eq!(parse_week("last week").unwrap_err().code(), "invalid_input");
    }

    #[test]
    fn bounds_follow_local_midnight() {
        let tz = FixedOffset::west_opt(7 * 3600).unwrap(); // UTC-7
        let (start, end) = bounds(&tz, d("2026-10-19")).unwrap();
        assert_eq!(start.to_rfc3339(), "2026-10-19T07:00:00+00:00");
        assert_eq!(end.to_rfc3339(), "2026-10-26T07:00:00+00:00");
    }

    #[test]
    fn lists_recent_weeks_newest_first() {
        let weeks = recent_mondays(d("2026-10-21"), 3);
        assert_eq!(
            weeks,
            vec![d("2026-10-19"), d("2026-10-12"), d("2026-10-05")]
        );
        assert_eq!(last_day(d("2026-10-19")), d("2026-10-25"));
    }
}
