import * as core from "@actions/core";
import { MODEL_LIMITS } from "./decisions.js";

export interface Config {
  provider: "openrouter" | "typesafe";
  apiKey: string;
  token: string;
  model: string;
  threshold: number;
  maxLabels: number;
  include: string[];
  exclude: string[];
  groups: string[][];
  dryRun: boolean;
}

const supported = new Set(Object.keys(MODEL_LIMITS));
export const DEFAULT_EXCLUDES = [
  "duplicate",
  "invalid",
  "wontfix",
  "good first issue",
  "help wanted",
];

function jsonNames(raw: string, name: string): string[] {
  if (!raw.trim()) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON.`);
  }
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  )
    throw new Error(`${name} must be a JSON array of non-empty label names.`);
  return value.map((item: string) => item.trim());
}

export function parseConfig(
  input: (name: string) => string,
  bool: (name: string) => boolean,
): Config {
  const provider = input("provider") || "openrouter";
  if (provider !== "openrouter" && provider !== "typesafe")
    throw new Error("provider must be openrouter or typesafe.");
  const apiKey = input(
    provider === "typesafe" ? "typesafe-api-key" : "openrouter-api-key",
  );
  const token = input("github-token") || process.env.GITHUB_TOKEN || "";
  if (!apiKey)
    throw new Error(
      `${provider === "typesafe" ? "typesafe-api-key" : "openrouter-api-key"} is required when provider is ${provider}.`,
    );
  if (!token) throw new Error("github-token is required.");
  const model = input("model") || "typesafe/jev-1.13";
  if (!supported.has(model)) throw new Error(`Unsupported model: ${model}`);
  if (provider === "typesafe" && model !== "typesafe/jev-1.13")
    throw new Error("The TypeSafe provider only supports Jev.");
  const threshold = Number(input("threshold") || "0.70");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("threshold must be a number from 0 to 1.");
  const maxLabels = Number(input("max-labels") || "3");
  if (!Number.isInteger(maxLabels) || maxLabels < 0 || maxLabels > 100)
    throw new Error("max-labels must be an integer from 0 to 100.");
  const include = jsonNames(input("include-labels"), "include-labels");
  const exclude = jsonNames(input("exclude-labels"), "exclude-labels");
  let groups: unknown;
  try {
    groups = input("exclusive-groups")
      ? JSON.parse(input("exclusive-groups"))
      : [];
  } catch {
    throw new Error("exclusive-groups must be valid JSON.");
  }
  if (
    !Array.isArray(groups) ||
    groups.some(
      (group) =>
        !Array.isArray(group) ||
        group.length < 2 ||
        group.some((n) => typeof n !== "string" || !n.trim()),
    )
  )
    throw new Error(
      "exclusive-groups must be a JSON array of label-name arrays, each with at least two names.",
    );
  const seen = new Set<string>();
  const normalizedGroups = (groups as string[][])
    .map((group) => group.map((n) => n.trim()))
    .map((group) => {
      for (const name of group) {
        const key = name.toLocaleLowerCase();
        if (seen.has(key))
          throw new Error(`exclusive-groups overlap at ${name}.`);
        seen.add(key);
      }
      return group;
    });
  return {
    provider,
    apiKey,
    token,
    model,
    threshold,
    maxLabels,
    include,
    exclude,
    groups: normalizedGroups,
    dryRun: input("dry-run") ? bool("dry-run") : false,
  };
}

export const readConfig = (): Config =>
  parseConfig(core.getInput, core.getBooleanInput);
