import { describe, expect, it } from "vitest";
import type { Point } from "../model/types";
import { RING_AREA_PER_TOPIC, SEED_SPREAD, seedPositions } from "./seedPositions";

const MID = () => 0.5; // no jitter, angle π

function known(entries: Record<string, [number, number]>): Map<string, Point> {
  return new Map(Object.entries(entries).map(([id, [x, y]]) => [id, { x, y }]));
}

describe("seedPositions", () => {
  it("leaves the very first layout to the simulation", () => {
    const seeds = seedPositions(["a", "b"], [{ source: "a", target: "b" }], new Map(), MID);
    expect(seeds.size).toBe(0);
  });

  it("starts a new topic at the centroid of its placed neighbours", () => {
    const k = known({ a: [100, 0], b: [0, 100], far: [-500, -500] });
    const seeds = seedPositions(["a", "b", "far", "new"], [{ source: "new", target: "a" }, { source: "b", target: "new" }], k, MID);

    expect(seeds.get("new")).toEqual({ x: 50, y: 50 });
    // Known topics keep their positions: only unknown ones are seeded.
    expect([...seeds.keys()]).toEqual(["new"]);
  });

  it("jitters around the centroid by at most half the spread", () => {
    const k = known({ a: [100, 0] });
    for (const r of [0, 0.999]) {
      const p = seedPositions(["a", "new"], [{ source: "a", target: "new" }], k, () => r).get("new");
      expect(Math.abs((p?.x ?? Infinity) - 100)).toBeLessThanOrEqual(SEED_SPREAD / 2);
      expect(Math.abs(p?.y ?? Infinity)).toBeLessThanOrEqual(SEED_SPREAD / 2);
    }
  });

  it("attaches a chain of new topics to the placed graph, whatever their order", () => {
    const k = known({ a: [300, 300] });
    // "c" is listed first but only touches "d", which touches the known "a".
    const seeds = seedPositions(["c", "d", "a"], [{ source: "c", target: "d" }, { source: "d", target: "a" }], k, MID);

    expect(seeds.get("d")).toEqual({ x: 300, y: 300 });
    expect(seeds.get("c")).toEqual({ x: 300, y: 300 });
  });

  it("puts an unconnected new topic on a ring just outside the current graph", () => {
    const k = known({ a: [300, 0], b: [0, -400] });
    const p = seedPositions(["a", "b", "lone"], [], k, MID).get("lone");
    const extent = 400;
    const outer = Math.sqrt(RING_AREA_PER_TOPIC / Math.PI + extent * extent);

    const d = Math.hypot(p?.x ?? 0, p?.y ?? 0);
    expect(d).toBeGreaterThanOrEqual(extent);
    expect(d).toBeLessThanOrEqual(outer);
  });

  it("spreads unconnected newcomers around the ring", () => {
    const k = known({ a: [400, 0] });
    const first = seedPositions(["a", "x"], [], k, () => 0).get("x");
    const last = seedPositions(["a", "x"], [], k, () => 0.999).get("x");

    // random 0: angle 0 at the inner edge; near 1: almost a full turn at the outer edge.
    expect(first?.x).toBeCloseTo(400);
    expect(first?.y).toBeCloseTo(0);
    expect(Math.hypot(last?.x ?? 0, last?.y ?? 0)).toBeGreaterThan(400);
    expect(last?.y).toBeLessThan(0);
  });

  it("starts a group of newcomers linked only to each other together, on the ring", () => {
    const k = known({ a: [400, 0] });
    const seeds = seedPositions(["a", "x", "y", "z"], [{ source: "x", target: "y" }, { source: "y", target: "z" }], k, MID);

    const x = seeds.get("x");
    expect(Math.hypot(x?.x ?? 0, x?.y ?? 0)).toBeGreaterThanOrEqual(400);
    // With no jitter the rest of the group starts exactly on its first member.
    expect(seeds.get("y")).toEqual(x);
    expect(seeds.get("z")).toEqual(x);
  });

  it("handles thousands of unconnected newcomers quickly", () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `n${i}`);
    const k = known({ n0: [0, 0] });
    const started = performance.now();
    const seeds = seedPositions(ids, [], k);

    expect(seeds.size).toBe(4999);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("never mutates the known positions", () => {
    const k = known({ a: [1, 2] });
    seedPositions(["a", "new"], [{ source: "a", target: "new" }], k, MID);
    expect([...k.entries()]).toEqual([["a", { x: 1, y: 2 }]]);
  });
});
