import { describe, expect, it, vi } from "vitest";
import { call, subscribe } from "./api";
import { AppError } from "./errors";
import { isTauri, setTransport, transport, type Transport } from "./transport";
import { mockTransport } from "./mock/mockTransport";

function fakeTransport(overrides: Partial<Transport>): Transport {
  return {
    invoke: vi.fn(),
    listen: vi.fn(async () => () => undefined),
    ...overrides,
  };
}

describe("call", () => {
  it("passes the command name and args through and returns the result", async () => {
    const invoke = vi.fn(async () => ({ ok: true, message: "fine" }));
    setTransport(fakeTransport({ invoke: invoke as unknown as Transport["invoke"] }));

    const result = await call("test_api_key", {});

    expect(invoke).toHaveBeenCalledWith("test_api_key", {});
    expect(result).toEqual({ ok: true, message: "fine" });
  });

  it("converts rejections into AppError with the command name", async () => {
    setTransport(fakeTransport({ invoke: vi.fn(async () => Promise.reject({ code: "no_api_key", message: "missing" })) }));

    const error = await call("test_api_key", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).command).toBe("test_api_key");
    expect((error as AppError).code).toBe("no_api_key");
  });
});

describe("subscribe", () => {
  it("delegates to the transport listener", async () => {
    const unlisten = vi.fn();
    const listen = vi.fn(async () => unlisten);
    setTransport(fakeTransport({ listen }));
    const handler = vi.fn();

    const result = await subscribe("job_finished", handler);

    expect(listen).toHaveBeenCalledWith("job_finished", handler);
    expect(result).toBe(unlisten);
  });
});

describe("transport selection", () => {
  it("uses the mock transport outside Tauri", () => {
    setTransport(null);

    expect(isTauri()).toBe(false);
    expect(transport()).toBe(mockTransport);
  });
});
