import { describe, expect, it } from "vitest";
import { decayBucket, retention, retentionPreview } from "./decay";

describe("retention", () => {
  it("halves every half-life", () => {
    expect(retention(0, 14)).toBe(1);
    expect(retention(14, 14)).toBeCloseTo(0.5);
    expect(retention(28, 14)).toBeCloseTo(0.25);
  });

  it("treats negative idle time as now and a non-positive half-life as fully decayed", () => {
    expect(retention(-3, 14)).toBe(1);
    expect(retention(5, 0)).toBe(0);
  });
});

describe("retentionPreview", () => {
  it("reports whole percentages for the preview days", () => {
    expect(retentionPreview(14)).toEqual([
      { days: 7, percent: 71 },
      { days: 30, percent: 23 },
      { days: 90, percent: 1 },
    ]);
  });
});

describe("decayBucket", () => {
  it("labels scores by threshold", () => {
    expect([0.9, 0.5, 0.2, 0.05].map(decayBucket)).toEqual(["hot", "warm", "fading", "cold"]);
  });
});
