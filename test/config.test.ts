import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

const parse = (values: Record<string, string>) =>
  parseConfig(
    (name) => values[name] ?? "",
    () => false,
  );

describe("configuration", () => {
  it("uses documented defaults and supported model IDs", () => {
    const config = parse({
      "openrouter-api-key": "key",
      "github-token": "token",
    });
    expect(config.model).toBe("typesafe/jev-1.13");
    expect(config.provider).toBe("openrouter");
    expect(config.threshold).toBe(0.67);
    expect(config.maxLabels).toBe(3);
    expect(config.exclude).toEqual([]);
    expect(() =>
      parse({
        "openrouter-api-key": "key",
        "github-token": "token",
        model: "provider/unknown",
      }),
    ).toThrow(/Unsupported model/);
  });

  it("accepts TypeSafe credentials for Jev and rejects unsupported models", () => {
    const config = parse({
      provider: "typesafe",
      "typesafe-api-key": "typesafe-key",
      "github-token": "token",
    });
    expect(config.provider).toBe("typesafe");
    expect(config.apiKey).toBe("typesafe-key");
    expect(() =>
      parse({ provider: "typesafe", "github-token": "token" }),
    ).toThrow(/typesafe-api-key/);
    expect(() =>
      parse({
        provider: "typesafe",
        "typesafe-api-key": "key",
        "github-token": "token",
        model: "microsoft/microsoft-decision-1",
      }),
    ).toThrow(/only supports Jev/);
  });

  it("rejects bad limits, malformed arrays, and overlapping groups", () => {
    expect(() =>
      parse({
        "openrouter-api-key": "key",
        "github-token": "token",
        threshold: "1.1",
      }),
    ).toThrow(/threshold/);
    expect(() =>
      parse({
        "openrouter-api-key": "key",
        "github-token": "token",
        "include-labels": "bug",
      }),
    ).toThrow(/JSON/);
    expect(() =>
      parse({
        "openrouter-api-key": "key",
        "github-token": "token",
        "exclusive-groups": '[["bug","feature"],["feature","docs"]]',
      }),
    ).toThrow(/overlap/);
  });
});
