import { describe, it, expect, beforeEach } from "vitest";
import { isBlockedHost, parseIPv4Literal, resetFetchRateLimit } from "../../src/tools/fetch-guarded";

describe("isBlockedHost", () => {
  it("blocks plain private/loopback/metadata hosts", () => {
    for (const h of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.5.4", "172.31.255.1", "169.254.169.254", "0.0.0.0", "::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedHost(h)).toBe(true);
    }
  });

  it("allows public hosts", () => {
    for (const h of ["example.com", "8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      expect(isBlockedHost(h)).toBe(false);
    }
  });

  it("blocks alternate decimal/hex/octal encodings of loopback", () => {
    // 2130706433 / 0x7f000001 / 017700000001 == 127.0.0.1
    expect(isBlockedHost("2130706433")).toBe(true);
    expect(isBlockedHost("0x7f000001")).toBe(true);
    expect(isBlockedHost("017700000001")).toBe(true);
    expect(isBlockedHost("0x7f.0.0.1")).toBe(true);
    expect(isBlockedHost("0177.0.0.1")).toBe(true);
    expect(isBlockedHost("127.1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 loopback", () => {
    expect(isBlockedHost("::ffff:7f00:1")).toBe(true);
    expect(isBlockedHost("::ffff:127.0.0.1")).toBe(true);
  });

  it("blocks multicast/reserved/CG-NAT ranges", () => {
    expect(isBlockedHost("224.0.0.1")).toBe(true);
    expect(isBlockedHost("100.64.0.1")).toBe(true);
  });
});

describe("parseIPv4Literal", () => {
  it("parses encodings, rejects DNS names", () => {
    expect(parseIPv4Literal("2130706433")).toEqual([127, 0, 0, 1]);
    expect(parseIPv4Literal("0x7f.0.0.1")).toEqual([127, 0, 0, 1]);
    expect(parseIPv4Literal("example.com")).toBeNull();
    expect(parseIPv4Literal("cafe")).toBeNull();
    expect(parseIPv4Literal("1.2.3.4.5")).toBeNull();
  });
});

describe("rate limit hook", () => {
  beforeEach(() => resetFetchRateLimit());

  it("resetFetchRateLimit clears state without throwing", () => {
    resetFetchRateLimit();
    expect(isBlockedHost("example.com")).toBe(false);
  });
});
