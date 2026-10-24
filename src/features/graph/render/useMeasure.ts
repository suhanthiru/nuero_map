import { useMemo } from "react";
import type { PaintTheme } from "./paintTheme";

/** Label width in px for the current label font, cached per string. */
export function useMeasure(theme: PaintTheme): (text: string) => number {
  return useMemo(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    const cache = new Map<string, number>();
    if (ctx) ctx.font = `600 ${theme.labelPx}px ${theme.fontFamily}`;
    return (text: string) => {
      const hit = cache.get(text);
      if (hit !== undefined) return hit;
      const w = ctx ? ctx.measureText(text).width : text.length * theme.labelPx * 0.55;
      cache.set(text, w);
      return w;
    };
  }, [theme]);
}
