import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getOctokit } from "@actions/github";
import { DEFAULT_EXCLUDES } from "../src/config.js";
import {
  batchQuestions,
  buildQuestions,
  callDecisions,
} from "../src/decisions.js";
import { getSnapshot, listRepositoryLabels } from "../src/github.js";
import { redactEvidence, sweepThresholds } from "../src/calibration.js";
import type { CalibrationExample } from "../src/calibration.js";
import type { DecisionAnswer } from "../src/types.js";

const owner = "EvanProgramming";
const repo = "OpenKyrozen";
const thresholds = [
  0.5, 0.55, 0.6, 0.65, 0.67, 0.68, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95,
];
const exclude = new Set(DEFAULT_EXCLUDES.map((name) => name.toLowerCase()));

interface DatasetItem {
  number: number;
  kind: "issue" | "pull_request";
  score: boolean;
}

const percent = (value: number | null) =>
  value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;

async function run(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const typeSafeKey = process.env.TYPESAFE_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!token || !typeSafeKey)
    throw new Error("Required workflow credentials are unavailable.");

  const octokit = getOctokit(token, { request: { fetch, timeout: 15_000 } });
  const items = JSON.parse(
    await readFile(resolve("docs/calibration-examples.json"), "utf8"),
  ) as DatasetItem[];
  const source = [] as (DatasetItem & {
    snapshot: Awaited<ReturnType<typeof getSnapshot>>;
  })[];
  for (const item of items)
    source.push({
      ...item,
      snapshot: await getSnapshot(
        octokit,
        owner,
        repo,
        item.number,
        item.kind === "pull_request",
      ),
    });
  const labels = await listRepositoryLabels(octokit, owner, repo);
  const labelsByName = new Map(
    labels.map((label) => [label.name.toLowerCase(), label]),
  );
  const goldNames = new Set(
    source
      .filter((item) => item.score)
      .flatMap((item) => item.snapshot.labels)
      .filter(
        (name) =>
          !name.toLowerCase().startsWith("review:") &&
          !exclude.has(name.toLowerCase()),
      ),
  );
  if ([...goldNames].some((name) => !labelsByName.has(name.toLowerCase())))
    throw new Error("A labeled example refers to a removed repository label.");
  const candidates = labels
    .filter(
      (label) =>
        !label.name.toLowerCase().startsWith("review:") &&
        !exclude.has(label.name.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!candidates.length || candidates.length > 100)
    throw new Error("The selected examples produced an invalid candidate set.");

  const sourceExamples: Omit<CalibrationExample, "answers" | "questions">[] =
    [];
  const references = [] as {
    id: string;
    url: string;
    kind: string;
    scored: boolean;
    goldLabels: string[];
  }[];
  for (const item of source) {
    const id = `${item.kind === "issue" ? "issue" : "pr"}-${item.number}`;
    const goldLabels = item.snapshot.labels.filter(
      (name) =>
        !name.toLowerCase().startsWith("review:") &&
        !exclude.has(name.toLowerCase()) &&
        candidates.some(
          (label) => label.name.toLowerCase() === name.toLowerCase(),
        ),
    );
    sourceExamples.push({
      id,
      kind: item.score ? item.kind : "ambiguous",
      score: item.score,
      goldLabels,
    });
    references.push({
      id,
      url: `https://github.com/${owner}/${repo}/${item.kind === "issue" ? "issues" : "pull"}/${item.number}`,
      kind: item.kind,
      scored: item.score,
      goldLabels,
    });
  }

  const providers = [
    {
      provider: "typesafe" as const,
      model: "typesafe/jev-1.13",
      apiKey: typeSafeKey,
    },
    ...(openRouterKey
      ? [
          {
            provider: "openrouter" as const,
            model: "microsoft/microsoft-decision-1",
            apiKey: openRouterKey,
          },
        ]
      : []),
  ];
  const models = [] as {
    provider: string;
    model: string;
    selectedThreshold: number | null;
    sweeps: ReturnType<typeof sweepThresholds>;
  }[];
  for (const configured of providers) {
    const examples: CalibrationExample[] = [];
    for (const [index, item] of source.entries()) {
      const questions = buildQuestions(candidates, [], [], true);
      const answers: Record<string, DecisionAnswer | undefined> = {};
      const evidence = redactEvidence(item.snapshot.stateText);
      const deadline = Date.now() + 120_000;
      for (const batch of batchQuestions(questions))
        Object.assign(
          answers,
          await callDecisions(
            configured.model,
            evidence,
            batch,
            configured.apiKey,
            fetch,
            deadline,
            configured.provider,
          ),
        );
      examples.push({ ...sourceExamples[index]!, questions, answers });
    }
    const sweeps = sweepThresholds(examples, candidates, thresholds);
    const qualifying = sweeps.filter(
      (sweep) =>
        sweep.precision !== null &&
        sweep.precision >= 0.95 &&
        sweep.truePositives >= 10,
    );
    models.push({
      provider: configured.provider,
      model: configured.model,
      selectedThreshold: qualifying[0]?.threshold ?? null,
      sweeps,
    });
  }
  const sharedThreshold =
    models.length > 1
      ? (thresholds.find((threshold) =>
          models.every((modelResult) =>
            modelResult.sweeps.some(
              (sweep) =>
                sweep.threshold === threshold &&
                sweep.precision !== null &&
                sweep.precision >= 0.95 &&
                sweep.truePositives >= 10,
            ),
          ),
        ) ?? null)
      : null;
  const result = {
    generatedAt: new Date().toISOString(),
    repository: `${owner}/${repo}`,
    policy: {
      maxLabels: 3,
      candidateLabels: candidates.map((label) => label.name),
    },
    references,
    qualification: {
      criterion:
        "lowest threshold with observed precision >= 95% and >= 10 correct accepted labels",
      modelsEvaluated: models.map(({ provider, model, selectedThreshold }) => ({
        provider,
        model,
        selectedThreshold,
      })),
      sharedThreshold,
    },
    models,
  };
  await writeFile(
    "calibration-results.json",
    `${JSON.stringify(result, null, 2)}\n`,
  );

  const scoredCount = sourceExamples.filter((example) => example.score).length;
  const table = [
    "| Provider / model | Threshold | TP | FP | FN | Precision | Recall | Abstained / scored |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...models.flatMap((modelResult) =>
      modelResult.sweeps.map(
        (sweep) =>
          `| ${modelResult.provider} / ${modelResult.model} | ${sweep.threshold.toFixed(2)} | ${sweep.truePositives} | ${sweep.falsePositives} | ${sweep.falseNegatives} | ${percent(sweep.precision)} | ${percent(sweep.recall)} | ${sweep.abstainedExamples} / ${scoredCount} |`,
      ),
    ),
  ].join("\n");
  const challengeCount = sourceExamples.filter(
    (example) => !example.score,
  ).length;
  const thresholdString = (threshold: number | null) =>
    threshold === null ? "none" : threshold.toFixed(2);
  const challengeAtDefault = models.map((modelResult) => {
    const sweep = modelResult.sweeps.find(
      (candidate) => candidate.threshold === 0.67,
    );
    const accepted = sweep?.challenges.reduce(
      (sum, challenge) => sum + challenge.predictedLabels.length,
      0,
    );
    return `${modelResult.model}=${accepted ?? 0}`;
  });
  const summary = [
    "# DeciLabel model calibration",
    `Repository: ${owner}/${repo}; ${scoredCount} labeled examples and ${challengeCount} unlabeled challenge examples; ${candidates.length} candidate labels.`,
    "Labeled examples are scored against their existing non-bot repository labels. Unlabeled challenge items are reported separately and do not count as known negatives.",
    table,
    `Per-model thresholds: ${models.map((modelResult) => `${modelResult.model}=${thresholdString(modelResult.selectedThreshold)}`).join(", ")}. Shared threshold: ${thresholdString(sharedThreshold)}.`,
    `At 0.67, selected labels across the ${challengeCount} unlabeled challenge items: ${challengeAtDefault.join(", ")}. These are not scored as errors.`,
    "Only scores, labels, public item references, and aggregate metrics are retained. Issue bodies, diffs, credentials, and raw provider payloads are not written to the artifact.",
  ].join("\n\n");
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) await appendFile(summaryPath, `${summary}\n`);
  console.log(summary);
}

run().catch(() => {
  console.error(
    "Calibration failed. Request evidence, response payloads, and credentials were suppressed.",
  );
  process.exitCode = 1;
});
