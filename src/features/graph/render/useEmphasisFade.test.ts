import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { FADE_MS } from "../model/emphasisFade";
import { useEmphasisFade } from "./useEmphasisFade";

const IDS = ["a", "b"];
const allIds = () => IDS;

interface Props {
  emphasis: ReadonlySet<string> | null;
  reduced: boolean;
}

function setup(reduced: boolean) {
  const repaint = vi.fn();
  const initialProps: Props = { emphasis: null, reduced };
  const hook = renderHook(({ emphasis, reduced: r }: Props) => useEmphasisFade(emphasis, r, allIds, repaint), { initialProps });
  return { ...hook, repaint };
}

describe("useEmphasisFade", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with everything lit and nothing to animate", () => {
    const { result, repaint } = setup(false);
    act(() => vi.advanceTimersByTime(FADE_MS * 2));
    expect(result.current()("b")).toBe(1);
    expect(repaint).not.toHaveBeenCalled();
  });

  it("fades the rest of the map down frame by frame, then stops", () => {
    const { result, rerender, repaint } = setup(false);
    rerender({ emphasis: new Set(["a"]), reduced: false });

    expect(result.current()("b")).toBe(1);
    act(() => vi.advanceTimersByTime(FADE_MS / 2));
    const midway = result.current()("b");
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(1);
    expect(repaint.mock.calls.length).toBeGreaterThan(1);

    act(() => vi.advanceTimersByTime(FADE_MS));
    expect(result.current()("b")).toBe(0);
    expect(result.current()("a")).toBe(1);
    const frames = repaint.mock.calls.length;
    act(() => vi.advanceTimersByTime(FADE_MS));
    expect(repaint.mock.calls.length).toBe(frames);
  });

  it("keeps animating after StrictMode's mount, unmount, remount", () => {
    const repaint = vi.fn();
    const initialProps: Props = { emphasis: new Set(["a"]), reduced: false };
    const { result } = renderHook(({ emphasis, reduced: r }: Props) => useEmphasisFade(emphasis, r, allIds, repaint), {
      initialProps,
      wrapper: StrictMode,
    });

    act(() => vi.advanceTimersByTime(FADE_MS * 2));
    expect(result.current()("b")).toBe(0);
    expect(repaint).toHaveBeenCalled();
  });

  it("stops repainting once unmounted", () => {
    const { rerender, unmount, repaint } = setup(false);
    rerender({ emphasis: new Set(["a"]), reduced: false });
    act(() => vi.advanceTimersByTime(FADE_MS / 4));
    const frames = repaint.mock.calls.length;

    unmount();
    act(() => vi.advanceTimersByTime(FADE_MS));
    expect(repaint.mock.calls.length).toBe(frames);
  });

  it("switches at once with reduced motion", () => {
    const { result, rerender, repaint } = setup(true);
    rerender({ emphasis: new Set(["a"]), reduced: true });

    expect(result.current()("b")).toBe(0);
    act(() => vi.advanceTimersByTime(FADE_MS));
    expect(repaint).not.toHaveBeenCalled();
  });
});
