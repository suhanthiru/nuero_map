import { describe, expect, it } from "vitest";
import { AppError, toAppError, USER_MESSAGES, userMessageOf } from "./errors";

describe("toAppError", () => {
  it("maps a backend error code to its friendly message", () => {
    const err = toAppError("import_export_zip", { code: "bad_zip", message: "no conversations.json" });

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("bad_zip");
    expect(err.command).toBe("import_export_zip");
    expect(err.message).toBe("no conversations.json");
    expect(err.userMessage).toBe(USER_MESSAGES.bad_zip);
  });

  it("falls back to a generic message for unknown codes", () => {
    const err = toAppError("get_graph", { code: "weird_thing", message: "boom" });

    expect(err.userMessage).toMatch(/something went wrong/i);
  });

  it("wraps plain Error and string rejections as unknown", () => {
    expect(toAppError("x", new Error("net down")).code).toBe("unknown");
    expect(toAppError("x", "plain string").message).toBe("plain string");
  });

  it("returns an existing AppError unchanged", () => {
    const original = new AppError("a", "not_found", "gone");

    expect(toAppError("b", original)).toBe(original);
  });

  it("does not treat objects without string code/message as backend errors", () => {
    expect(toAppError("x", { code: 42 }).code).toBe("unknown");
    expect(toAppError("x", null).code).toBe("unknown");
  });
});

describe("userMessageOf", () => {
  it("returns the user message for AppError and a generic one otherwise", () => {
    expect(userMessageOf(new AppError("c", "no_api_key", "m"))).toBe(USER_MESSAGES.no_api_key);
    expect(userMessageOf(new Error("x"))).toMatch(/something went wrong/i);
  });
});
