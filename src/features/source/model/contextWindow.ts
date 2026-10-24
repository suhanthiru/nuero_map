import type { SourceContext, SourceMessage } from "../../../api/contract";
import { speakerLabel } from "../../../shared/excerpt/apps";

export function focusMessage(ctx: SourceContext): SourceMessage | undefined {
  return ctx.messages.find((m) => m.id === ctx.focusMessageId);
}

/** Plain-text transcript of the visible turns, labelled by speaker, for the clipboard. */
export function transcriptText(ctx: SourceContext): string {
  return ctx.messages.map((m) => `${speakerLabel(m.speaker, ctx.app)}: ${m.text}`).join("\n\n");
}
