import { describe, expect, it } from "vitest";
import { fadeDone, levelAt, litAlpha, startFade, type Fade } from "./emphasisFade";

const IDS = ["a", "b", "c"];
const MS = 200;

describe("emphasisFade", () => {
  it("lights everything when nothing is emphasised", () => {
    expect(levelAt(null, "a", 0)).toBe(1);
    const f = startFade(null, IDS, null, 0, MS);
    expect(IDS.map((id) => levelAt(f, id, 50))).toEqual([1, 1, 1]);
  });

  it("eases topics outside the emphasis down, and keeps the emphasised ones lit", () => {
    const f = startFade(null, IDS, new Set(["a"]), 1000, MS);

    expect(levelAt(f, "b", 1000)).toBe(1);
    const early = levelAt(f, "b", 1050);
    const late = levelAt(f, "b", 1150);
    expect(early).toBeLessThan(1);
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThan(0);
    expect(levelAt(f, "b", 1000 + MS)).toBe(0);
    expect(levelAt(f, "a", 1100)).toBe(1);
  });

  it("switches instantly with no duration (reduced motion)", () => {
    const f = startFade(null, IDS, new Set(["a"]), 0, 0);
    expect(levelAt(f, "b", 0)).toBe(0);
    expect(fadeDone(f, 0)).toBe(true);
  });

  it("retargets mid-fade from where each topic currently is, without a jump", () => {
    const first = startFade(null, IDS, new Set(["a"]), 0, MS);
    const midway = levelAt(first, "b", 100);
    const back = startFade(first, IDS, null, 100, MS);

    expect(levelAt(back, "b", 100)).toBeCloseTo(midway);
    expect(levelAt(back, "b", 150)).toBeGreaterThan(midway);
    expect(levelAt(back, "b", 100 + MS)).toBe(1);
  });

  it("keeps running when the same emphasis arrives as a new set", () => {
    const f = startFade(null, IDS, new Set(["a", "b"]), 0, MS);
    expect(startFade(f, IDS, new Set(["b", "a"]), 50, MS)).toBe(f);
    expect(startFade(f, IDS, new Set(["a"]), 50, MS)).not.toBe(f);
  });

  it("shows topics that appear mid-fade at their target straight away", () => {
    const f: Fade = startFade(null, ["a"], new Set(["a"]), 0, MS);
    expect(levelAt(f, "late", 10)).toBe(0);
  });

  it("reports when it has finished", () => {
    const f = startFade(null, IDS, new Set(["a"]), 0, MS);
    expect(fadeDone(f, MS - 1)).toBe(false);
    expect(fadeDone(f, MS)).toBe(true);
  });

  it("maps a level onto opacity between the dim floor and full", () => {
    expect(litAlpha(1, 0.16)).toBe(1);
    expect(litAlpha(0, 0.16)).toBe(0.16);
    expect(litAlpha(0.5, 0.2)).toBeCloseTo(0.6);
  });
});
