import { describe, expect, it, vi } from "vitest";
import { mockEmit, mockListen } from "./mockEvents";

const PAYLOAD = { topicIds: ["t1"] };

describe("mockEvents", () => {
  it("keeps a re-subscribed handler when an earlier subscription is removed", () => {
    const handler = vi.fn();
    const unlistenFirst = mockListen("topics_changed", handler);
    const unlistenSecond = mockListen("topics_changed", handler);

    unlistenFirst();
    mockEmit("topics_changed", PAYLOAD);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(PAYLOAD);
    unlistenSecond();
  });

  it("stops delivering after unlisten", () => {
    const handler = vi.fn();
    const unlisten = mockListen("topics_changed", handler);

    unlisten();
    mockEmit("topics_changed", PAYLOAD);

    expect(handler).not.toHaveBeenCalled();
  });
});
