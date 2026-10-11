import { evaluateAnswers } from "./policy.js";
import type {
  DecisionAnswer,
  DecisionQuestion,
  Label,
  LabelResult,
} from "./types.js";

export function redactEvidence(text: string): string {
  return text
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|apikey_[A-Za-z0-9_]{32,}|AKIA[0-9A-Z]{16})\b/g,
      "[REDACTED]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]\s*["']?)[^\s"',;]{12,}/gi,
      "$1[REDACTED]",
    );
}

export interface CalibrationExample {
  id: string;
  kind: "issue" | "pull_request" | "ambiguous";
  score: boolean;
  goldLabels: string[];
  questions: DecisionQuestion[];
  answers: Record<string, DecisionAnswer | undefined>;
}

export interface ThresholdSweep {
  threshold: number;
  scoredExamples: number;
  acceptedLabels: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  abstainedExamples: number;
  examples: {
    id: string;
    kind: CalibrationExample["kind"];
    predictedLabels: string[];
    correctLabels: string[];
    falsePositiveLabels: string[];
    missedLabels: string[];
    results: LabelResult[];
  }[];
  challenges: { id: string; predictedLabels: string[] }[];
}

export function sweepThresholds(
  examples: CalibrationExample[],
  labels: Label[],
  thresholds: number[],
): ThresholdSweep[] {
  return thresholds.map((threshold) => {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let abstainedExamples = 0;
    const scored = [] as ThresholdSweep["examples"];
    const challenges: ThresholdSweep["challenges"] = [];
    for (const example of examples) {
      const { selected, results } = evaluateAnswers(
        example.questions,
        example.answers,
        labels,
        threshold,
        3,
        [],
        [],
        0,
      );
      if (!example.score) {
        challenges.push({ id: example.id, predictedLabels: selected });
        continue;
      }
      const gold = new Set(
        example.goldLabels.map((name) => name.toLowerCase()),
      );
      const selectedSet = new Set(selected.map((name) => name.toLowerCase()));
      const correctLabels = selected.filter((name) =>
        gold.has(name.toLowerCase()),
      );
      const falsePositiveLabels = selected.filter(
        (name) => !gold.has(name.toLowerCase()),
      );
      const missedLabels = example.goldLabels.filter(
        (name) => !selectedSet.has(name.toLowerCase()),
      );
      truePositives += correctLabels.length;
      falsePositives += falsePositiveLabels.length;
      falseNegatives += missedLabels.length;
      if (!selected.length) abstainedExamples++;
      scored.push({
        id: example.id,
        kind: example.kind,
        predictedLabels: selected,
        correctLabels,
        falsePositiveLabels,
        missedLabels,
        results,
      });
    }
    const acceptedLabels = truePositives + falsePositives;
    const actualLabels = truePositives + falseNegatives;
    return {
      threshold,
      scoredExamples: scored.length,
      acceptedLabels,
      truePositives,
      falsePositives,
      falseNegatives,
      precision: acceptedLabels ? truePositives / acceptedLabels : null,
      recall: actualLabels ? truePositives / actualLabels : null,
      abstainedExamples,
      examples: scored,
      challenges,
    };
  });
}
