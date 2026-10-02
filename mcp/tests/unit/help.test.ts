import { describe, it, expect } from "vitest";
import { getHelpText } from "../../src/help";

describe("fimake --help", () => {
  const text = getHelpText("1.0.0-test");

  it("names every command and flag the CLI actually handles", () => {
    for (const token of ["doctor", "stop", "install-plugin", "--version", "--help", "--dir", "--version-tag", "--no-register", "--yes"]) {
      expect(text).toContain(token);
    }
  });

  it("documents every env var config.ts parses", () => {
    for (const name of ["TRANSPORT", "PORT", "TASK_TIMEOUT_MS", "TASK_ACK_TIMEOUT_MS", "CORS_ORIGIN", "JSON_BODY_LIMIT", "DEBUG"]) {
      expect(text).toContain(name);
    }
  });

  it("stamps the running version", () => {
    expect(text).toContain("fimake 1.0.0-test");
  });
});
