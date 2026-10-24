import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { EdgeKind, GraphNode } from "../../../api/contract";
import { neighbours } from "../model/filterGraph";
import { sizeValue, valueRadius, type SizeBy } from "../model/scales";
import type { PlacedNode, Point, VisibleGraph } from "../model/types";
import type { GraphForces } from "../state/graphSettingsStore";
import { cachedPosition, rememberPositions } from "./positionCache";
import { seedPositions } from "./seedPositions";

// d3-force works by mutating these objects in place; they never leave this module.
interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
  node: GraphNode;
}
type SimLink = SimulationLinkDatum<SimNode> & { strength: number; kind: EdgeKind };
type Sim = Simulation<SimNode, SimLink>;

/** How hard each kind of link pulls; a link you wrote in a note counts nearly as much as one you made in chat. */
const KIND_WEIGHT: Readonly<Record<EdgeKind, number>> = { explicit: 1, note: 0.9, cooccurrence: 0.75, semantic: 0.3 };
const ALPHA_MIN = 0.004;
const WARM_ALPHA = 0.25;
const SLIDER_ALPHA = 0.35;
const DRAG_ALPHA_TARGET = 0.25;
/** Reduced motion: a few synchronous ticks per pointer move instead of a running animation. */
const DRAG_SYNC_ALPHA = 0.08;
const DRAG_SYNC_TICKS = 4;
const SYNC_TICKS = 320;
const COLLIDE_PAD = 6;

export interface LayoutOptions {
  readonly forces: GraphForces;
  readonly sizeBy: SizeBy;
  readonly nodeScale: number;
  readonly reducedMotion: boolean;
  /** Separate position memory per graph instance. */
  readonly namespace: string;
}

export interface DragApi {
  start: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  end: (id: string) => void;
}

/** Maps the 0..1 / 0..20 slider values onto d3 force parameters. */
function applyForces(sim: Sim, f: GraphForces): void {
  const center = 0.005 + 0.1 * f.center;
  sim.force<ReturnType<typeof forceX<SimNode>>>("x")?.strength(center);
  sim.force<ReturnType<typeof forceY<SimNode>>>("y")?.strength(center);
  sim.force<ReturnType<typeof forceManyBody<SimNode>>>("charge")?.strength((n) => -(8 + f.repel * 6) - 5 * n.r);
  sim
    .force<ReturnType<typeof forceLink<SimNode, SimLink>>>("link")
    ?.distance((l) => f.distance * (0.4 + 0.9 * (1 - l.strength)) + (l.source as SimNode).r + (l.target as SimNode).r)
    .strength((l) => Math.min(1, f.link * (0.08 + 0.55 * l.strength * KIND_WEIGHT[l.kind])));
}

function buildSimulation(nodes: SimNode[], links: SimLink[], forces: GraphForces): Sim {
  const sim = forceSimulation<SimNode, SimLink>(nodes)
    .alphaMin(ALPHA_MIN)
    .force("link", forceLink<SimNode, SimLink>(links).id((n) => n.id))
    .force("charge", forceManyBody<SimNode>().distanceMax(600))
    .force("collide", forceCollide<SimNode>((n) => n.r + COLLIDE_PAD).iterations(2))
    .force("x", forceX<SimNode>(0))
    .force("y", forceY<SimNode>(0))
    .stop();
  applyForces(sim, forces);
  return sim;
}

function snapshot(nodes: readonly SimNode[]): PlacedNode[] {
  return nodes.map((n) => ({ node: n.node, x: n.x ?? 0, y: n.y ?? 0, r: n.r }));
}

interface Layout {
  /** The graph these positions belong to, so callers can tell a stale layout from a fresh one. */
  readonly graph: VisibleGraph | null;
  readonly placed: readonly PlacedNode[];
}

export interface ForceLayout {
  readonly placed: readonly PlacedNode[];
  /** False for the render(s) between a new graph arriving and its first positions. */
  readonly ready: boolean;
  readonly drag: DragApi;
}

/**
 * Force-directed layout. Settling animates (or is computed in one go with reduced
 * motion), positions are remembered per namespace, force sliders apply live, and
 * nodes can be dragged.
 */
export function useForceLayout(graph: VisibleGraph, opts: LayoutOptions): ForceLayout {
  const [layout, setLayout] = useState<Layout>({ graph: null, placed: [] });
  const frame = useRef<number | null>(null);
  const simRef = useRef<{ sim: Sim; nodes: SimNode[]; graph: VisibleGraph } | null>(null);
  /** Forces the running simulation was built or last retuned with. */
  const appliedForces = useRef<GraphForces | null>(null);
  const { forces, sizeBy, nodeScale, reducedMotion, namespace } = opts;
  const radius = useMemo(() => {
    const adj = neighbours(graph);
    return valueRadius(graph.nodes, (n) => sizeValue(n, sizeBy, adj.get(n.id)?.size ?? 0), nodeScale);
  }, [graph, sizeBy, nodeScale]);

  const publish = useCallback((owner: VisibleGraph, nodes: SimNode[]) => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setLayout({ graph: owner, placed: snapshot(nodes) });
    });
  }, []);

  useEffect(() => {
    const known = new Map<string, Point>();
    for (const node of graph.nodes) {
      const p = cachedPosition(node.id, namespace);
      if (p) known.set(node.id, p);
    }
    // Newcomers start beside the topics they link to, so the map doesn't reshuffle around them.
    const seeds = seedPositions(graph.nodes.map((n) => n.id), graph.edges, known);
    const nodes: SimNode[] = graph.nodes.map((node) => {
      const p = known.get(node.id) ?? seeds.get(node.id);
      return { id: node.id, node, r: radius(node), x: p?.x, y: p?.y };
    });
    const links: SimLink[] = graph.edges.map((e) => ({ source: e.source, target: e.target, strength: e.strength, kind: e.kind }));
    const sim = buildSimulation(nodes, links, forces);
    simRef.current = { sim, nodes, graph };
    appliedForces.current = forces;
    const mostlyKnown = nodes.length > 0 && known.size / nodes.length > 0.8;
    const remember = () => rememberPositions(nodes.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 })), namespace);
    const show = () => setLayout({ graph, placed: snapshot(nodes) });
    sim.on("tick", () => publish(graph, nodes));
    sim.on("end", () => {
      remember();
      show();
    });
    if (reducedMotion) {
      sim.alpha(mostlyKnown ? WARM_ALPHA : 1).tick(SYNC_TICKS);
      remember();
      show();
    } else {
      // Pre-settle off screen so the first frame is already readable, then animate the rest.
      sim.alpha(mostlyKnown ? WARM_ALPHA : 1).tick(mostlyKnown ? 0 : Math.round(SYNC_TICKS / 3));
      show();
      sim.restart();
    }
    return () => {
      sim.stop();
      remember();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      simRef.current = null;
    };
    // Forces are applied live below; rebuilding on every slider tick would reshuffle the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, radius, reducedMotion, namespace, publish]);

  // Slider changes: retune the running simulation and give it a gentle nudge.
  useEffect(() => {
    const current = simRef.current;
    if (!current || appliedForces.current === forces) return;
    appliedForces.current = forces;
    applyForces(current.sim, forces);
    if (reducedMotion) {
      current.sim.alpha(SLIDER_ALPHA).tick(SYNC_TICKS / 2);
      setLayout({ graph: current.graph, placed: snapshot(current.nodes) });
    } else {
      current.sim.alpha(SLIDER_ALPHA).restart();
    }
  }, [forces, reducedMotion]);

  // Under reduced motion dragging moves the topic directly, settles its neighbours
  // synchronously, and leaves it where it is dropped, instead of running an animation.
  const drag = useMemo<DragApi>(() => {
    const find = (id: string) => {
      const cur = simRef.current;
      const n = cur?.nodes.find((x) => x.id === id);
      return cur && n ? { cur, n } : null;
    };
    const showNow = (cur: { sim: Sim; nodes: SimNode[]; graph: VisibleGraph }) =>
      setLayout({ graph: cur.graph, placed: snapshot(cur.nodes) });
    return {
      start: (id) => {
        const hit = find(id);
        if (!hit) return;
        hit.n.fx = hit.n.x;
        hit.n.fy = hit.n.y;
        if (!reducedMotion) hit.cur.sim.alphaTarget(DRAG_ALPHA_TARGET).restart();
      },
      move: (id, x, y) => {
        const hit = find(id);
        if (!hit) return;
        hit.n.fx = x;
        hit.n.fy = y;
        if (reducedMotion) {
          hit.cur.sim.alpha(DRAG_SYNC_ALPHA).tick(DRAG_SYNC_TICKS);
          showNow(hit.cur);
        } else publish(hit.cur.graph, hit.cur.nodes);
      },
      end: (id) => {
        const hit = find(id);
        if (!hit) return;
        hit.n.fx = null;
        hit.n.fy = null;
        // Reduced motion: the topic stays where it was dropped (settling would make it jump).
        if (!reducedMotion) hit.cur.sim.alphaTarget(0);
        rememberPositions(hit.cur.nodes.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 })), namespace);
      },
    };
  }, [publish, reducedMotion, namespace]);

  return { placed: layout.placed, ready: layout.graph === graph, drag };
}
