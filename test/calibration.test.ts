import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chooseCoverageThreshold,
  redactEvidence,
  sweepThresholds,
} from "../src/calibration.js";
import type { CalibrationExample, ThresholdSweep } from "../src/calibration.js";
import type { Label } from "../src/types.js";

const labels: Label[] = [
  { id: "bug", name: "bug", description: "A defect" },
  { id: "docs", name: "documentation", description: "Documentation" },
  { id: "cli", name: "area: cli", description: "Command line" },
];

const examples: CalibrationExample[] = [
  {
    id: "issue-1",
    kind: "issue",
    score: true,
    goldLabels: ["bug"],
    questions: [
      { id: "q-bug", type: "noul", labelIds: ["bug"] },
      { id: "q-docs", type: "noul", labelIds: ["docs"] },
    ],
    answers: {
      "q-bug": { type: "noul", noul: 0.8 },
      "q-docs": { type: "noul", noul: 0.2 },
    },
  },
  {
    id: "pr-2",
    kind: "pull_request",
    score: true,
    goldLabels: ["area: cli"],
    questions: [{ id: "q-cli", type: "noul", labelIds: ["cli"] }],
    answers: { "q-cli": { type: "noul", noul: 0.65 } },
  },
  {
    id: "pr-3",
    kind: "ambiguous",
    score: false,
    goldLabels: [],
    questions: [{ id: "q-docs", type: "noul", labelIds: ["docs"] }],
    answers: { "q-docs": { type: "noul", noul: 0.9 } },
  },
];

describe("calibration threshold sweep", () => {
  it("keeps the reviewed real-example cohort balanced and unique", () => {
    const source = JSON.parse(
      readFileSync(
        new URL("../docs/calibration-examples.json", import.meta.url),
        "utf8",
      ),
    ) as { number: number; kind: string; score: boolean }[];

    expect(source).toHaveLength(24);
    expect(
      source.filter((item) => item.score && item.kind === "issue"),
    ).toHaveLength(8);
    expect(
      source.filter((item) => item.score && item.kind === "pull_request"),
    ).toHaveLength(8);
    expect(source.filter((item) => !item.score)).toHaveLength(8);
    expect(
      new Set(source.map((item) => `${item.kind}-${item.number}`)).size,
    ).toBe(24);
  });

  it("redacts credentials in fetched evidence before provider submission", () => {
    const key = `apikey_${"A".repeat(40)}`;
    const token = `ghp_${"B".repeat(40)}`;

    const safe = redactEvidence(
      `API_KEY=${key}\nAuthorization: Bearer ${token}`,
    );

    expect(safe).not.toContain(key);
    expect(safe).not.toContain(token);
    expect(safe).toContain("[REDACTED]");
  });

  it("scores labeled examples and reports ambiguous challenges separately", () => {
    const [low, high] = sweepThresholds(examples, labels, [0.6, 0.7]);

    expect(low).toMatchObject({
      threshold: 0.6,
      scoredExamples: 2,
      acceptedLabels: 2,
      truePositives: 2,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 1,
      recall: 1,
      abstainedExamples: 0,
    });
    expect(high).toMatchObject({
      threshold: 0.7,
      scoredExamples: 2,
      acceptedLabels: 1,
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 1,
      precision: 1,
      recall: 0.5,
      abstainedExamples: 1,
    });
    expect(low?.challenges).toEqual([
      { id: "pr-3", predictedLabels: ["documentation"] },
    ]);
  });

  it("chooses the broadest coverage while preserving the precision floor", () => {
    const sweeps = [
      {
        threshold: 0.67,
        precision: 0.71,
        truePositives: 25,
        acceptedLabels: 36,
      },
      { threshold: 0.92, precision: 1, truePositives: 12, acceptedLabels: 12 },
      {
        threshold: 0.91,
        precision: 0.82,
        truePositives: 13,
        acceptedLabels: 16,
      },
      {
        threshold: 0.9,
        precision: 0.78,
        truePositives: 14,
        acceptedLabels: 18,
      },
      { threshold: 0.8, precision: 0.8, truePositives: 10, acceptedLabels: 15 },
    ] as ThresholdSweep[];

    expect(chooseCoverageThreshold(sweeps)).toBe(0.91);
    expect(
      chooseCoverageThreshold([
        {
          threshold: 0.9,
          precision: 0.8,
          truePositives: 9,
          acceptedLabels: 12,
        },
      ] as ThresholdSweep[]),
    ).toBeNull();
  });
});
