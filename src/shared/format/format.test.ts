import { describe, expect, it } from "vitest";
import { daysSince, formatDate, formatDateTime, formatTime, relativeDays } from "./dates";
import { formatCount, formatUsd } from "./numbers";

const NOW = new Date("2026-09-28T12:00:00Z");

describe("dates", () => {
  it("formats same-year dates without the year", () => {
    expect(formatDate("2026-09-21T10:00:00Z", NOW)).toBe("Sep 21");
    expect(formatDate("2025-03-02T10:00:00Z", NOW)).toBe("Mar 2, 2025");
    expect(formatDate("garbage", NOW)).toBe("unknown date");
    expect(formatDateTime("garbage", NOW)).toBe("unknown date");
    expect(formatDateTime("2026-09-21T10:00:00Z", NOW)).toMatch(/^Sep 21, /);
  });

  it("shows only the time for today and adds the date otherwise", () => {
    const now = new Date(2026, 8, 28, 15, 0);

    expect(formatTime(new Date(2026, 8, 28, 14, 41).toISOString(), now)).toMatch(/^2:41\sPM$/);
    expect(formatTime(new Date(2026, 8, 27, 14, 41).toISOString(), now)).toMatch(/^Sep 27, 2:41\sPM$/);
    expect(formatTime("garbage", now)).toBe("unknown time");
  });

  it("counts whole days and never goes negative", () => {
    expect(daysSince("2026-09-16T12:00:00Z", NOW)).toBe(12);
    expect(daysSince("2026-10-01T00:00:00Z", NOW)).toBe(0);
    expect(daysSince("nope", NOW)).toBe(0);
  });

  it("describes relative age at readable granularity", () => {
    expect(relativeDays("2026-09-28T01:00:00Z", NOW)).toBe("today");
    expect(relativeDays("2026-09-27T01:00:00Z", NOW)).toBe("yesterday");
    expect(relativeDays("2026-09-16T12:00:00Z", NOW)).toBe("12d ago");
    expect(relativeDays("2026-05-01T12:00:00Z", NOW)).toBe("5mo ago");
    expect(relativeDays("2023-09-01T12:00:00Z", NOW)).toBe("3y ago");
  });
});

describe("numbers", () => {
  it("uses grouping for small counts and compact form for large ones", () => {
    expect(formatCount(1480)).toBe("1,480");
    expect(formatCount(9_200_000)).toBe("9.2M");
  });

  it("formats dollars, flagging sub-cent amounts", () => {
    expect(formatUsd(7.354)).toBe("$7.35");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.004)).toBe("< $0.01");
  });
});
