import type { CommandArgs, CommandName, CommandResult, EventName, Events } from "./contract";
import { toAppError } from "./errors";
import { transport, type Unlisten } from "./transport";

/** Typed `invoke`: command names, args, and results all come from the contract. */
export async function call<K extends CommandName>(
  command: K,
  args: CommandArgs<K>,
): Promise<CommandResult<K>> {
  try {
    return await transport().invoke<CommandResult<K>>(command, args as Record<string, unknown>);
  } catch (raw) {
    throw toAppError(command, raw);
  }
}

/** Typed `listen`. Resolves to an unlisten function. */
export function subscribe<E extends EventName>(
  event: E,
  handler: (payload: Events[E]) => void,
): Promise<Unlisten> {
  return transport().listen(event, handler);
}
