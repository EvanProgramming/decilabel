import { describe, expect, it } from "vitest";
import { evaluateAnswers } from "../src/policy.js";
import type { DecisionQuestion, Label } from "../src/types.js";

const labels: Label[] = [
  { id: "1", name: "bug", description: "A defect" },
  { id: "2", name: "feature", description: "A request" },
  { id: "3", name: "docs", description: "Documentation" },
];

describe("decision policy", () => {
  it("accepts Noul only with a valid yes probability at the threshold", () => {
    const q: DecisionQuestion[] = [{ id: "q1", type: "noul", labelIds: ["1"] }];
    expect(
      evaluateAnswers(
        q,
        { q1: { type: "noul", noul: 0.7 } },
        labels,
        0.7,
        3,
        [],
        [],
      ).selected,
    ).toEqual(["bug"]);
    expect(
      evaluateAnswers(
        q,
        { q1: { type: "noul", noul: 0.699 } },
        labels,
        0.7,
        3,
        [],
        [],
      ).selected,
    ).toEqual([]);
  });

  it("requires a distribution and a 0.20 choice margin, and supports none", () => {
    const q: DecisionQuestion[] = [
      { id: "q2", type: "choice", labelIds: ["1", "2"], noneId: "none" },
    ];
    const run = (probabilities: Record<string, number>) =>
      evaluateAnswers(
        q,
        { q2: { type: "choice", choice: "1", probabilities } },
        labels,
        0.7,
        3,
        [],
        [],
      );
    expect(run({ "1": 0.7, "2": 0.1, none: 0.2 }).selected).toEqual(["bug"]);
    expect(run({ "1": 0.6, "2": 0.4, none: 0 }).selected).toEqual([]);
    expect(run({ "1": 0.1, "2": 0.1, none: 0.8 }).selected).toEqual([]);
    expect(run({ "1": 0.7 }).selected).toEqual([]);
  });

  it("preserves existing labels, applies exclusions and groups, and enforces the ceiling", () => {
    const qs: DecisionQuestion[] = ["1", "2", "3"].map((id, i) => ({
      id: `q${i}`,
      type: "noul",
      labelIds: [id],
    }));
    const answers = Object.fromEntries(
      qs.map((q) => [q.id, { type: "noul" as const, noul: 0.99 }]),
    );
    const out = evaluateAnswers(
      qs,
      answers,
      labels,
      0.7,
      2,
      ["bug"],
      [["feature", "docs"]],
    );
    expect(out.selected).toEqual(["docs"]);
  });

  it("abstains on malformed and missing answers with deterministic reasons", () => {
    const q: DecisionQuestion[] = [{ id: "q", type: "noul", labelIds: ["1"] }];
    expect(
      evaluateAnswers(q, {}, labels, 0.7, 3, [], []).results[0]?.reason,
    ).toBe("missing-answer");
    expect(
      evaluateAnswers(
        q,
        { q: { type: "noul", noul: 4 } },
        labels,
        0.7,
        3,
        [],
        [],
      ).results[0]?.reason,
    ).toBe("invalid-probability");
  });

  it("uses internal choice option IDs and rejects distributions that do not cover all options", () => {
    const q: DecisionQuestion[] = [
      {
        id: "q",
        type: "choice",
        labelIds: ["1", "2"],
        optionToLabel: { o0: "1", o1: "2" },
        noneId: "none",
      },
    ];
    const out = evaluateAnswers(
      q,
      {
        q: {
          type: "choice",
          choice: "o0",
          probabilities: { o0: 0.8, o1: 0.1, none: 0.1 },
        },
      },
      labels,
      0.7,
      3,
      [],
      [],
    );
    expect(out.selected).toEqual(["bug"]);
    const bad = evaluateAnswers(
      q,
      {
        q: {
          type: "choice",
          choice: "o0",
          probabilities: { o0: 0.8, o1: 0.1 },
        },
      },
      labels,
      0.7,
      3,
      [],
      [],
    );
    expect(bad.results[0]?.reason).toBe("invalid-probability");
  });
});
