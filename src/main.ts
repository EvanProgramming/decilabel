import * as core from "@actions/core";
import * as github from "@actions/github";
import { DEFAULT_EXCLUDES, readConfig } from "./config.js";
import { batchQuestions, buildQuestions, callDecisions } from "./decisions.js";
import {
  addWithRetry,
  escapeMarkdown,
  getFreshSnapshot,
  getSnapshot,
  listRepositoryLabels,
  makeClient,
  readRemovalState,
} from "./github.js";
import { evaluateAnswers } from "./policy.js";
import type { DecisionAnswer } from "./types.js";

const out = (name: string, value: unknown) =>
  core.setOutput(
    name,
    typeof value === "string" ? value : JSON.stringify(value),
  );

export async function run(): Promise<void> {
  let status = "failed";
  let skipReason = "";
  let selected: string[] = [];
  let added: string[] = [];
  let results: unknown[] = [];
  try {
    const config = readConfig();
    const { context } = github;
    if (!context.repo.owner || !context.repo.repo || !context.issue.number)
      throw new Error("This action requires an issue or pull request event.");
    const isPr = Boolean(context.payload.pull_request);
    const number = context.issue.number;
    const client = makeClient(config);
    const [initial, labels] = await Promise.all([
      getSnapshot(client, context.repo.owner, context.repo.repo, number, isPr),
      listRepositoryLabels(client, context.repo.owner, context.repo.repo),
    ]);
    if (initial.state !== "open") {
      status = "skipped";
      skipReason = "item-not-open";
      return;
    }
    const labelByName = new Map(
      labels.map((label) => [label.name.toLocaleLowerCase(), label]),
    );
    const resolve = (names: string[], setting: string) =>
      names.map((name) => {
        const label = labelByName.get(name.toLocaleLowerCase());
        if (!label)
          throw new Error(
            `${setting} refers to an unknown repository label: ${name}`,
          );
        return label.name;
      });
    const include = resolve(config.include, "include-labels");
    const exclude = new Set(
      [
        ...DEFAULT_EXCLUDES.filter((name) =>
          labelByName.has(name.toLocaleLowerCase()),
        ),
        ...resolve(config.exclude, "exclude-labels"),
      ].map((name) => name.toLocaleLowerCase()),
    );
    const groups = config.groups.map((group) =>
      resolve(group, "exclusive-groups"),
    );
    const current = new Set(
      initial.labels.map((name) => name.toLocaleLowerCase()),
    );
    const eligible = labels.filter(
      (label) =>
        (!include.length ||
          include.some(
            (name) =>
              name.toLocaleLowerCase() === label.name.toLocaleLowerCase(),
          )) &&
        !exclude.has(label.name.toLocaleLowerCase()),
    );
    const occupied = initial.labels.filter((name) =>
      current.has(name.toLocaleLowerCase()),
    );
    const history = await readRemovalState(client, initial.nodeId);
    const vetoIds = history.vetoed;
    const active = eligible.filter(
      (label) =>
        !current.has(label.name.toLocaleLowerCase()) && !vetoIds.has(label.id),
    );
    const questions = buildQuestions(
      active,
      groups,
      occupied,
      include.length > 0,
    );
    if (!questions.length) {
      status = "skipped";
      skipReason = "no-eligible-labels";
      return;
    }
    const deadline = Date.now() + 120_000;
    const answers: Record<string, DecisionAnswer | undefined> = {};
    for (const batch of batchQuestions(questions))
      Object.assign(
        answers,
        await callDecisions(
          config.model,
          initial.stateText,
          batch,
          config.apiKey,
          fetch,
          deadline,
        ),
      );
    const existingEligibleCount = initial.labels.filter((name) =>
      eligible.some(
        (label) => label.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      ),
    ).length;
    const policy = evaluateAnswers(
      questions,
      answers,
      labels,
      config.threshold,
      config.maxLabels,
      initial.labels,
      groups,
      existingEligibleCount,
    );
    selected = policy.selected.filter(
      (name) =>
        !vetoIds.has(labelByName.get(name.toLocaleLowerCase())?.id ?? ""),
    );
    results = policy.results.map((result) => ({
      ...result,
      ...(initial.warnings.length
        ? { coverageWarnings: initial.warnings }
        : {}),
      ...(vetoIds.has(
        labelByName.get(result.label.toLocaleLowerCase())?.id ?? "",
      )
        ? { selected: false, reason: "maintainer-removed" }
        : {}),
    }));
    if (!selected.length) {
      status = config.dryRun ? "dry-run" : "completed";
      skipReason = "no-labels-selected";
      return;
    }
    if (config.dryRun) {
      status = "dry-run";
      return;
    }
    const [fresh, freshLabels] = await Promise.all([
      getFreshSnapshot(
        client,
        context.repo.owner,
        context.repo.repo,
        number,
        isPr,
      ),
      listRepositoryLabels(client, context.repo.owner, context.repo.repo),
    ]);
    if (fresh.key !== initial.key || fresh.state !== "open") {
      status = "skipped";
      skipReason = "item-changed-during-classification";
      selected = [];
      results = (results as { selected?: boolean }[]).map((result) =>
        result.selected
          ? {
              ...result,
              selected: false,
              reason: "item-changed-during-classification",
            }
          : result,
      );
      return;
    }
    const [freshHistory] = await Promise.all([
      readRemovalState(client, fresh.nodeId),
    ]);
    const freshNames = new Set(
      freshLabels.map((label) => label.name.toLocaleLowerCase()),
    );
    const freshGroups = groups.map((group) =>
      group.filter((name) => freshNames.has(name.toLocaleLowerCase())),
    );
    const freshCurrent = new Set(
      fresh.labels.map((name) => name.toLocaleLowerCase()),
    );
    const groupOccupied = new Set(
      freshGroups.flatMap((group, i) =>
        group.some((name) => freshCurrent.has(name.toLocaleLowerCase()))
          ? [i]
          : [],
      ),
    );
    const freshEligibleCount = fresh.labels.filter(
      (name) =>
        eligible.some(
          (label) =>
            label.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        ) && freshNames.has(name.toLocaleLowerCase()),
    ).length;
    let slots = Math.max(0, config.maxLabels - freshEligibleCount);
    const freshReasons = new Map<string, string>();
    const initialLabelsByName = new Map(
      labels.map((label) => [label.name.toLocaleLowerCase(), label]),
    );
    const toAdd: string[] = [];
    for (const name of selected) {
      const canonical = freshLabels.find(
        (label) => label.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
      const prior = initialLabelsByName.get(name.toLocaleLowerCase());
      if (
        !canonical ||
        !prior ||
        canonical.id !== prior.id ||
        canonical.description !== prior.description
      ) {
        freshReasons.set(name.toLocaleLowerCase(), "label-definition-changed");
        continue;
      }
      if (freshCurrent.has(name.toLocaleLowerCase())) {
        freshReasons.set(name.toLocaleLowerCase(), "already-present");
        continue;
      }
      if (freshHistory.vetoed.has(canonical.id)) {
        freshReasons.set(name.toLocaleLowerCase(), "maintainer-removed");
        continue;
      }
      const groupIndex = freshGroups.findIndex((group) =>
        group.some((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase()),
      );
      if (groupIndex >= 0 && groupOccupied.has(groupIndex)) {
        freshReasons.set(name.toLocaleLowerCase(), "exclusive-group-occupied");
        continue;
      }
      if (slots <= 0) {
        freshReasons.set(name.toLocaleLowerCase(), "max-labels");
        continue;
      }
      if (groupIndex >= 0) groupOccupied.add(groupIndex);
      toAdd.push(canonical.name);
      slots--;
    }
    if (toAdd.length) await addWithRetry(client, fresh, toAdd);
    added = toAdd;
    selected = toAdd;
    results = (results as { label?: string; selected?: boolean }[]).map(
      (result) => {
        const reason = freshReasons.get(
          result.label?.toLocaleLowerCase() ?? "",
        );
        return reason ? { ...result, selected: false, reason } : result;
      },
    );
    status = "completed";
  } catch {
    core.setFailed(
      "DeciLabel could not safely complete classification. Check configuration, permissions, and provider availability; request and response details were omitted.",
    );
    status = "failed";
  } finally {
    out("selected-labels", selected);
    out("added-labels", added);
    out("results", results);
    out("status", status);
    out("skip-reason", skipReason);
    const table = (
      results as { label?: string; probability?: number; reason?: string }[]
    )
      .map(
        (r) =>
          `| ${escapeMarkdown(r.label ?? "")} | ${r.probability?.toFixed(3) ?? "—"} | ${escapeMarkdown(r.reason ?? "")} |`,
      )
      .join("\n");
    await core.summary
      .addHeading("DeciLabel results")
      .addRaw(
        `Status: **${status}**${skipReason ? ` — ${escapeMarkdown(skipReason)}` : ""}\n\nSelected: ${selected.map(escapeMarkdown).join(", ") || "none"}\n\n| Label | Probability | Result |\n| --- | ---: | --- |\n${table || "| — | — | No label decisions. |"}`,
      )
      .write();
  }
}
