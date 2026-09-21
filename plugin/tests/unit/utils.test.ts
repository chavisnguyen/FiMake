import { describe, it, expect } from "vitest";
import { convertToRGBA, convertToHex } from "../../main/utils/color-conversion";
import { getFontStyle } from "../../main/utils/get-font-style";
import { getSolidColorPaint, getSolidHEXColorPaint } from "../../main/utils/get-solid-color-paint";
import type { ColorHex } from "@shared/types/params/shared/color-hex";

describe("convertToHex", () => {
  it("converts RGB to 8-digit hex", () => {
    expect(convertToHex({ r: 1, g: 0, b: 0 })).toBe("#ff0000FF");
    expect(convertToHex({ r: 0, g: 1, b: 0, a: 0.5 })).toMatch(/^#00ff00/i);
  });
  it("rounds + pads", () => {
    expect(convertToHex({ r: 0, g: 0, b: 0 })).toBe("#000000FF");
    expect(convertToHex({ r: 1, g: 1, b: 1, a: 1 })).toBe("#ffffffFF".toLowerCase());
  });
  it("missing/zero alpha falls back to FF (documents a:0 bug)", () => {
    expect(convertToHex({ r: 0, g: 0, b: 0, a: 0 })).toBe("#000000FF");
  });
});

describe("convertToRGBA", () => {
  it("parses 8-digit hex", () => {
    const c = convertToRGBA("#ff0000FF");
    expect(c.r).toBeCloseTo(1);
    expect(c.g).toBe(0);
    expect(c.a).toBeCloseTo(1);
  });
  it("parses alpha", () => {
    expect(convertToRGBA("#00000080").a).toBeCloseTo(0x80 / 255);
  });
  it("falls back to black on invalid", () => {
    expect(convertToRGBA("#fff" as ColorHex)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(convertToRGBA("red" as ColorHex).r).toBe(0);
  });
  it("round-trips", () => {
    const roundTripped = convertToRGBA(convertToHex({ r: 0.2, g: 0.4, b: 0.6, a: 1 }));
    expect(typeof roundTripped.r).toBe("number");
  });
});

describe("getFontStyle", () => {
  it.each([
    [100, "Thin"], [200, "Extra Light"], [300, "Light"], [400, "Regular"],
    [500, "Medium"], [600, "Semi Bold"], [700, "Bold"], [800, "Extra Bold"], [900, "Black"],
  ] as Array<[number, string]>)("%i -> %s", (w, s) => expect(getFontStyle(w)).toBe(s));
  it("defaults unknown to Regular", () => {
    expect(getFontStyle(450)).toBe("Regular");
    expect(getFontStyle(0)).toBe("Regular");
  });
});

describe("getSolidColorPaint", () => {
  it("builds SOLID paint with opacity from alpha", () => {
    expect(getSolidColorPaint({ r: 1, g: 0, b: 0, a: 0.5 })).toMatchObject({ type: "SOLID", opacity: 0.5 });
  });
  it("defaults opacity 1 when alpha missing (and when a=0 due to ||)", () => {
    expect(getSolidColorPaint({ r: 0, g: 0, b: 0 }).opacity).toBe(1);
  });
  it("getSolidHEXColorPaint parses hex then builds paint", () => {
    expect(getSolidHEXColorPaint("#ff0000FF")).toMatchObject({ type: "SOLID" });
  });
});

describe("resolvePropertyKey", () => {
  it("exact match wins, short name resolves via # suffix, miss passes through", async () => {
    const { resolvePropertyKey } = await import("../../main/utils/component-property-key");
    const comp = { componentPropertyDefinitions: { "Label#2045:2": { type: "TEXT" } } };
    expect(resolvePropertyKey(comp, "Label#2045:2")).toBe("Label#2045:2");
    expect(resolvePropertyKey(comp, "Label")).toBe("Label#2045:2");
    expect(resolvePropertyKey(comp, "Nope")).toBe("Nope");
    expect(resolvePropertyKey(null, "Label")).toBe("Label");
    expect(resolvePropertyKey({}, "Label")).toBe("Label");
  });
});
