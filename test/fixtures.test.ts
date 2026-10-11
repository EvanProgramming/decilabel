import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("representative evaluation set", () => {
  it("contains eight issues, eight PRs, and eight ambiguous or adversarial examples", () => {
    const rows = JSON.parse(
      readFileSync(
        new URL("./fixtures/examples.json", import.meta.url),
        "utf8",
      ),
    ) as { kind: string; coverage?: string; labels: string[]; body: string }[];
    expect(rows).toHaveLength(24);
    expect(rows.slice(0, 8).every((row) => row.kind === "issue")).toBe(true);
    expect(rows.slice(8, 16).every((row) => row.kind === "pull_request")).toBe(
      true,
    );
    expect(rows.slice(16).length).toBe(8);
    expect(
      rows.slice(16).some((row) => /ignore all rules|SYSTEM:/.test(row.body)),
    ).toBe(true);
  });
});
