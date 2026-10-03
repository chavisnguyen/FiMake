import { describe, it, expect } from "vitest";
import { parseSubcommand } from "../../src/cli-args";

describe("parseSubcommand", () => {
  it("matches argv[2] exactly", () => {
    expect(parseSubcommand(["doctor"])).toBe("doctor");
    expect(parseSubcommand(["stop"])).toBe("stop");
    expect(parseSubcommand(["install-plugin", "--yes"])).toBe("install-plugin");
    expect(parseSubcommand([])).toBeUndefined();
    expect(parseSubcommand(["--version"])).toBeUndefined();
  });

  it("never matches flag values", () => {
    // `fimake --dir doctor` used to run the doctor via args.includes().
    expect(parseSubcommand(["--dir", "doctor"])).toBeUndefined();
    expect(parseSubcommand(["--version-tag", "stop"])).toBeUndefined();
  });
});
