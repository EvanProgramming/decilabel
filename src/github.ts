import { getOctokit } from "@actions/github";
import type { Config } from "./config.js";
import type { Label } from "./types.js";

type Octokit = ReturnType<typeof getOctokit>;
export interface ItemSnapshot {
  owner: string;
  repo: string;
  number: number;
  kind: "issue" | "pull_request";
  nodeId: string;
  title: string;
  body: string;
  head?: string;
  base?: string;
  draft?: boolean;
  labels: string[];
  state: string;
  stateText: string;
  warnings: string[];
  key: string;
}

export interface RemovalState {
  vetoed: Set<string>;
  count: number;
}
interface TimelineEvent {
  id: string;
  __typename?: string;
  actor?: { __typename?: string } | null;
  label?: { id?: string; name?: string } | null;
  createdAt?: string;
}

export function makeClient(config: Config): Octokit {
  return getOctokit(config.token, { request: { fetch, timeout: 15_000 } });
}

export async function listRepositoryLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<Label[]> {
  const labels = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100,
  });
  return labels
    .filter((l) => !("archived_at" in l && l.archived_at))
    .map((l) => ({
      id: l.node_id,
      name: l.name,
      description: l.description ?? "",
    }));
}

async function readItem(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  isPr: boolean,
  withFiles: boolean,
): Promise<ItemSnapshot> {
  const issue = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: number,
  });
  let pr: Awaited<ReturnType<Octokit["rest"]["pulls"]["get"]>> | undefined;
  const warnings: string[] = [];
  if (isPr)
    pr = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
  const title = issue.data.title;
  const body = issue.data.body ?? "";
  let diff: string[] = [];
  if (isPr && withFiles) {
    const first = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: number,
      per_page: 100,
      page: 1,
    });
    const second =
      first.data.length === 100
        ? await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: number,
            per_page: 100,
            page: 2,
          })
        : { data: [] };
    const files = [...first.data, ...second.data];
    const used = files.slice(0, 200);
    if (files.length >= 200) warnings.push("File list capped at 200 records.");
    const omitted = Math.max(
      0,
      (pr?.data.changed_files ?? files.length) - used.length,
    );
    if (omitted > 0)
      warnings.push(`${omitted} files omitted by the 200-file cap.`);
    const budget = Math.max(32, Math.floor(8_000 / Math.max(1, used.length)));
    diff = used.map((file) => {
      if (!file.patch) {
        warnings.push(`Diff unavailable for ${file.filename}.`);
        return `${file.status} ${file.filename}: patch unavailable (binary, too large, or omitted).`;
      }
      const patch = file.patch.slice(0, budget);
      if (patch.length < file.patch.length)
        warnings.push(`Diff excerpt truncated for ${file.filename}.`);
      return `${file.status} ${file.filename}${file.previous_filename ? ` (renamed from ${file.previous_filename})` : ""}\n${patch}`;
    });
  }
  const clippedTitle = title.slice(0, 500);
  const clippedBody = body.slice(0, 4_000);
  if (clippedTitle !== title || clippedBody !== body)
    warnings.push("Issue text was truncated.");
  const state = isPr ? pr!.data.state : issue.data.state;
  const head = pr?.data.head.sha;
  const base = pr?.data.base.sha;
  const draft = pr?.data.draft;
  const stateObject = {
    kind: isPr ? "pull_request" : "issue",
    title: clippedTitle,
    body: clippedBody,
    ...(isPr
      ? {
          changedFiles: pr!.data.changed_files,
          additions: pr!.data.additions,
          deletions: pr!.data.deletions,
          head,
          base,
          draft,
          files: diff,
          coverageWarnings: [...new Set(warnings)],
        }
      : {}),
  };
  return {
    owner,
    repo,
    number,
    kind: isPr ? "pull_request" : "issue",
    nodeId: issue.data.node_id,
    title,
    body,
    ...(head ? { head } : {}),
    ...(base ? { base } : {}),
    ...(draft !== undefined ? { draft } : {}),
    labels: issue.data.labels.map((l) =>
      typeof l === "string" ? l : (l.name ?? ""),
    ),
    state,
    stateText: JSON.stringify(stateObject),
    warnings: [...new Set(warnings)],
    key: JSON.stringify({ title, body, state, head, base }),
  };
}

export const getSnapshot = (
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  isPr: boolean,
) => readItem(octokit, owner, repo, number, isPr, true);
export const getFreshSnapshot = (
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  isPr: boolean,
) => readItem(octokit, owner, repo, number, isPr, false);

export async function readRemovalState(
  octokit: Octokit,
  nodeId: string,
): Promise<RemovalState> {
  const lastHuman = new Map<string, boolean>();
  const seen = new Set<string>();
  let cursor: string | null = null;
  let count = 0;
  while (true) {
    const data: {
      node?: {
        timelineItems?: {
          edges: { cursor: string; node: TimelineEvent }[];
          pageInfo: { hasNextPage: boolean; endCursor?: string | null };
        };
      };
    } = await octokit.graphql(
      `query($id: ID!, $cursor: String) { node(id: $id) { ... on Issue { timelineItems(first: 100, after: $cursor, itemTypes: [LABELED_EVENT, UNLABELED_EVENT]) { edges { cursor node { __typename ... on LabeledEvent { id createdAt actor { __typename } label { id name } } ... on UnlabeledEvent { id createdAt actor { __typename } label { id name } } } } pageInfo { hasNextPage endCursor } } } ... on PullRequest { timelineItems(first: 100, after: $cursor, itemTypes: [LABELED_EVENT, UNLABELED_EVENT]) { edges { cursor node { __typename ... on LabeledEvent { id createdAt actor { __typename } label { id name } } ... on UnlabeledEvent { id createdAt actor { __typename } label { id name } } } } pageInfo { hasNextPage endCursor } } } } }`,
      { id: nodeId, cursor },
    );
    const connection = data.node?.timelineItems;
    if (
      !connection ||
      !Array.isArray(connection.edges) ||
      typeof connection.pageInfo?.hasNextPage !== "boolean"
    )
      throw new Error("Label history is unavailable or malformed.");
    for (const edge of connection.edges) {
      const event = edge.node;
      if (
        !event ||
        typeof event.id !== "string" ||
        (event.__typename !== "LabeledEvent" &&
          event.__typename !== "UnlabeledEvent") ||
        !event.label ||
        typeof event.label.id !== "string" ||
        typeof event.label.name !== "string" ||
        (event.actor != null &&
          (typeof event.actor !== "object" ||
            typeof event.actor.__typename !== "string"))
      )
        throw new Error("Label history is malformed.");
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      count++;
      if (count > 1000)
        throw new Error("Label history exceeds the 1,000-event safety limit.");
      const id = event.label.id;
      if (event.actor?.__typename === "Bot") continue;
      if (event.__typename === "LabeledEvent") {
        if (event.actor?.__typename === "User") lastHuman.set(id, false);
      } else if (event.actor?.__typename !== "Bot") lastHuman.set(id, true);
    }
    if (!connection.pageInfo.hasNextPage) break;
    if (
      !connection.pageInfo.endCursor ||
      connection.pageInfo.endCursor === cursor
    )
      throw new Error("Label history pagination is malformed.");
    cursor = connection.pageInfo.endCursor;
  }
  return {
    vetoed: new Set(
      [...lastHuman].filter(([, veto]) => veto).map(([id]) => id),
    ),
    count,
  };
}

export async function addLabels(
  octokit: Octokit,
  snapshot: ItemSnapshot,
  labels: string[],
): Promise<void> {
  if (!labels.length) return;
  await octokit.rest.issues.addLabels({
    owner: snapshot.owner,
    repo: snapshot.repo,
    issue_number: snapshot.number,
    labels,
  });
}

export async function addWithRetry(
  octokit: Octokit,
  snapshot: ItemSnapshot,
  labels: string[],
): Promise<void> {
  // shortcut: GitHub does not make timeline checks and additions atomic, upgrade if GitHub provides a transactional label API.
  for (let attempt = 0; ; attempt++) {
    try {
      await addLabels(octokit, snapshot, labels);
      return;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (attempt >= 2 || !(status === 429 || (status ?? 0) >= 500))
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
}

export function escapeMarkdown(value: string): string {
  return value
    .replace(/[\\`*_{}\[\]()#+.!|<>]/g, "\\$&")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200);
}
