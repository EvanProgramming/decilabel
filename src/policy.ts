import type {
  DecisionAnswer,
  DecisionQuestion,
  Label,
  LabelResult,
  PolicyResult,
} from "./types.js";

const validProbability = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

export function evaluateAnswers(
  questions: DecisionQuestion[],
  answers: Record<string, DecisionAnswer | undefined>,
  labels: Label[],
  threshold: number,
  maxLabels: number,
  existing: string[],
  groups: string[][],
  existingEligibleCount = existing.length,
): PolicyResult {
  const byId = new Map(labels.map((label) => [label.id, label]));
  const existingSet = new Set(existing.map((n) => n.toLocaleLowerCase()));
  const groupByLabel = new Map<string, string>();
  groups.forEach((group, i) =>
    group.forEach((name) =>
      groupByLabel.set(name.toLocaleLowerCase(), String(i)),
    ),
  );
  const occupied = new Set<string>();
  existingSet.forEach((name) => {
    const group = groupByLabel.get(name);
    if (group !== undefined) occupied.add(group);
  });
  const results: LabelResult[] = [];
  for (const question of questions) {
    const answer = answers[question.id];
    if (question.type === "noul") {
      const label = byId.get(question.labelIds[0] ?? "");
      if (!label) continue;
      const result: LabelResult = {
        label: label.name,
        selected: false,
        reason: "missing-answer",
      };
      if (answer?.type !== "noul") {
        results.push(result);
        continue;
      }
      if (!validProbability(answer.noul)) result.reason = "invalid-probability";
      else {
        result.probability = answer.noul;
        if (validProbability(answer.confidence))
          result.confidence = answer.confidence;
        result.reason =
          answer.noul < threshold ? "below-threshold" : "accepted";
        result.selected = result.reason === "accepted";
      }
      results.push(result);
      continue;
    }
    const optionIds = [
      ...(question.optionToLabel
        ? Object.keys(question.optionToLabel)
        : question.labelIds),
      ...(question.noneId ? [question.noneId] : []),
    ];
    const probs = answer?.type === "choice" ? answer.probabilities : undefined;
    const optionLabels = question.labelIds
      .map((id) => byId.get(id))
      .filter((label): label is Label => Boolean(label));
    if (!answer) {
      optionLabels.forEach((label) =>
        results.push({
          label: label.name,
          selected: false,
          reason: "missing-answer",
        }),
      );
      continue;
    }
    if (
      answer.type !== "choice" ||
      !probs ||
      optionIds.some((id) => !validProbability(probs[id])) ||
      Math.abs(
        optionIds.reduce(
          (sum, id) => sum + (validProbability(probs?.[id]) ? probs[id] : 0),
          0,
        ) - 1,
      ) > 0.02
    ) {
      optionLabels.forEach((label) =>
        results.push({
          label: label.name,
          selected: false,
          reason: "invalid-probability",
        }),
      );
      continue;
    }
    const selectedId = answer.choice;
    if (!optionIds.includes(selectedId ?? "")) {
      optionLabels.forEach((label) =>
        results.push({
          label: label.name,
          selected: false,
          reason: "invalid-choice",
        }),
      );
      continue;
    }
    const winning = selectedId ? probs[selectedId] : undefined;
    const margin = validProbability(winning)
      ? winning -
        Math.max(
          0,
          ...optionIds
            .filter((id) => id !== selectedId)
            .map((id) => probs[id] ?? 0),
        )
      : -1;
    const selectedLabelId =
      question.optionToLabel?.[selectedId ?? ""] ?? selectedId;
    const resultStart = results.length;
    optionLabels.forEach((label) => {
      const isWinner = label.id === selectedLabelId;
      const optionId =
        Object.entries(question.optionToLabel ?? {}).find(
          ([, labelId]) => labelId === label.id,
        )?.[0] ?? label.id;
      const prob = probs[optionId];
      let reason = "not-selected";
      if (isWinner && !validProbability(prob)) reason = "invalid-probability";
      else if (isWinner && margin < 0.2) reason = "insufficient-margin";
      else if (isWinner && prob! < threshold) reason = "below-threshold";
      else if (isWinner) reason = "accepted";
      results.push({
        label: label.name,
        ...(validProbability(prob) ? { probability: prob } : {}),
        ...(validProbability(answer.confidence)
          ? { confidence: answer.confidence }
          : {}),
        selected: Boolean(
          isWinner &&
          margin >= 0.2 &&
          validProbability(prob) &&
          prob >= threshold,
        ),
        reason,
      });
    });
    if (question.noneId && selectedId === question.noneId) {
      results.slice(resultStart).forEach((result) => {
        result.reason = "none-selected";
      });
    }
  }
  const eligibleResults = results.filter(
    (r) => !existingSet.has(r.label.toLocaleLowerCase()),
  );
  const ranked = eligibleResults
    .filter((r) => r.selected)
    .sort(
      (a, b) =>
        (b.probability ?? 0) - (a.probability ?? 0) ||
        a.label.localeCompare(b.label),
    );
  const maxNew = Math.max(0, maxLabels - existingEligibleCount);
  const selected: string[] = [];
  const acceptedGroups = new Set(occupied);
  for (const result of ranked) {
    if (selected.length >= maxNew) {
      result.selected = false;
      result.reason = "max-labels";
      continue;
    }
    const group = groupByLabel.get(result.label.toLocaleLowerCase());
    if (group !== undefined && acceptedGroups.has(group)) {
      result.selected = false;
      result.reason = "exclusive-group-occupied";
      continue;
    }
    if (group !== undefined) acceptedGroups.add(group);
    selected.push(result.label);
  }
  return { selected, results };
}
