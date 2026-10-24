import type { EventName, Events } from "../contract";

type Handler<E extends EventName> = (payload: Events[E]) => void;
type AnyHandler = (payload: unknown) => void;

const subscriptions = new Map<EventName, Set<AnyHandler>>();

/**
 * Each call registers a distinct subscription, even for the same handler function,
 * matching Tauri's `listen`. (React StrictMode subscribes the same handler twice and
 * unsubscribes one; a shared Set entry would silently drop the survivor.)
 */
export function mockListen<E extends EventName>(event: E, handler: Handler<E>): () => void {
  const set = subscriptions.get(event) ?? new Set<AnyHandler>();
  const entry: AnyHandler = (payload) => handler(payload as Events[E]);
  set.add(entry);
  subscriptions.set(event, set);
  return () => {
    set.delete(entry);
  };
}

export function mockEmit<E extends EventName>(event: E, payload: Events[E]): void {
  subscriptions.get(event)?.forEach((h) => h(payload));
}
