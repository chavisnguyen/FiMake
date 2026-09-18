import { describe, it, expect } from "vitest";
import { envStartSchema, PORT } from "../../src/config/config";

describe("config", () => {
  it("defaults to stdio + timeouts", () => {
    const c = envStartSchema.parse({});
    expect(c.TRANSPORT).toBe("stdio");
    expect(c.TASK_TIMEOUT_MS).toBe(20000);
    expect(c.TASK_ACK_TIMEOUT_MS).toBe(5000);
  });

  it("accepts streamable-http case-insensitive", () => {
    expect(envStartSchema.parse({ TRANSPORT: "streamable-http" }).TRANSPORT).toBe("streamable-http");
    expect(envStartSchema.parse({ TRANSPORT: "STREAMABLE-HTTP" }).TRANSPORT).toBe("streamable-http");
  });

  it("falls back to stdio for unknown transport", () => {
    expect(envStartSchema.parse({ TRANSPORT: "sse" }).TRANSPORT).toBe("stdio");
  });

  it("coerces numeric strings, rejects non-positive", () => {
    expect(envStartSchema.parse({ TASK_TIMEOUT_MS: "5000" }).TASK_TIMEOUT_MS).toBe(5000);
    expect(() => envStartSchema.parse({ TASK_TIMEOUT_MS: 0 })).toThrow();
    expect(() => envStartSchema.parse({ TASK_TIMEOUT_MS: -1 })).toThrow();
    expect(() => envStartSchema.parse({ TASK_ACK_TIMEOUT_MS: "abc" })).toThrow();
  });

  it("PORT defaults to 10101 and is configurable", () => {
    expect(PORT).toBe(10101);
    expect(envStartSchema.parse({}).PORT).toBe(10101);
    expect(envStartSchema.parse({ PORT: "5000" }).PORT).toBe(5000);
    expect(() => envStartSchema.parse({ PORT: 0 })).toThrow();
  });

  it("CORS_ORIGIN and JSON_BODY_LIMIT have safe defaults", () => {
    const c = envStartSchema.parse({});
    expect(c.CORS_ORIGIN).toBe("*");
    expect(c.JSON_BODY_LIMIT).toBe("1mb");
  });
});
