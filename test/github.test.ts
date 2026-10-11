import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSnapshot, readRemovalState } from "../src/github.js";
import type { Label } from "../src/types.js";

const label: Label = {
  id: "LABEL_OLD",
  name: "renamed later",
  description: "",
};
const event = (
  id: string,
  typename: string,
  actor: string,
  labelId = label.id,
  labelName = label.name,
) => ({
  id,
  __typename: typename,
  actor: { __typename: actor },
  label: { id: labelId, name: labelName },
});
const client = (pages: unknown[]) => {
  let i = 0;
  return { graphql: async () => pages[i++] } as never;
};
const page = (
  events: unknown[],
  hasNextPage = false,
  endCursor: string | null = null,
) => ({
  node: {
    timelineItems: {
      edges: events.map((node, i) => ({ cursor: `c${i}`, node })),
      pageInfo: { hasNextPage, endCursor },
    },
  },
});

describe("maintainer-removal history", () => {
  it("vetoes user removal, ignores bot changes, and clears only on a later user addition", async () => {
    const removed = await readRemovalState(
      client([page([event("1", "UnlabeledEvent", "User")])]),
      "node",
    );
    expect(removed.vetoed.has(label.id)).toBe(true);
    const botAfter = await readRemovalState(
      client([
        page([
          event("1", "UnlabeledEvent", "User"),
          event("2", "LabeledEvent", "Bot"),
        ]),
      ]),
      "node",
    );
    expect(botAfter.vetoed.has(label.id)).toBe(true);
    const humanAgain = await readRemovalState(
      client([
        page([
          event("1", "UnlabeledEvent", "User"),
          event("2", "LabeledEvent", "User"),
        ]),
      ]),
      "node",
    );
    expect(humanAgain.vetoed.has(label.id)).toBe(false);
  });

  it("treats unknown removals conservatively and keys renamed labels by stable ID", async () => {
    const state = await readRemovalState(
      client([
        page([event("1", "UnlabeledEvent", "App", label.id, "new label name")]),
      ]),
      "node",
    );
    expect(state.vetoed.has(label.id)).toBe(true);
    const recreated = await readRemovalState(
      client([
        page([event("1", "UnlabeledEvent", "User", "LABEL_NEW", label.name)]),
      ]),
      "node",
    );
    expect(recreated.vetoed.has(label.id)).toBe(false);
  });

  it("paginates, deduplicates event IDs, and fails closed beyond 1,000 events", async () => {
    const first = page([event("1", "UnlabeledEvent", "User")], true, "cursor");
    const second = page([
      event("1", "UnlabeledEvent", "User"),
      event("2", "LabeledEvent", "User"),
    ]);
    const state = await readRemovalState(client([first, second]), "node");
    expect(state.count).toBe(2);
    const tooMany = page(
      Array.from({ length: 1001 }, (_, i) =>
        event(String(i), "UnlabeledEvent", "User"),
      ),
    );
    await expect(readRemovalState(client([tooMany]), "node")).rejects.toThrow(
      /1,000/,
    );
  });

  it("fails closed when timeline data is malformed", async () => {
    await expect(readRemovalState(client([{}]), "node")).rejects.toThrow(
      /unavailable or malformed/,
    );
  });
});

describe("GitHub context", () => {
  it("handles an Issue with a null body", async () => {
    const api = {
      rest: {
        issues: {
          get: async () => ({
            data: {
              node_id: "node",
              title: "Question",
              body: null,
              state: "open",
              labels: [],
            },
          }),
        },
      },
    };
    const item = await getSnapshot(api as never, "owner", "repo", 1, false);
    expect(item.body).toBe("");
    expect(JSON.parse(item.stateText)).toMatchObject({
      title: "Question",
      body: "",
    });
  });

  it("captures renamed and binary PR files and warns on truncation and file caps", async () => {
    const files = (page: number) =>
      Array.from({ length: 100 }, (_, i) => ({
        filename: `file-${page}-${i}`,
        previous_filename: i === 0 && page === 1 ? "old-name" : undefined,
        status: i === 0 ? "renamed" : "modified",
        patch: i === 1 ? undefined : "+x\n".repeat(100),
      }));
    const api = {
      rest: {
        issues: {
          get: async () => ({
            data: {
              node_id: "node",
              title: "Patch update",
              body: "",
              state: "open",
              labels: [],
            },
          }),
        },
        pulls: {
          get: async () => ({
            data: {
              state: "open",
              head: { sha: "head" },
              base: { sha: "base" },
              draft: false,
              changed_files: 240,
              additions: 12,
              deletions: 5,
            },
          }),
          listFiles: async ({ page }: { page: number }) => ({
            data: files(page),
          }),
        },
      },
    };
    const item = await getSnapshot(api as never, "owner", "repo", 1, true);
    const state = JSON.parse(item.stateText);
    expect(state.files[0]).toContain("renamed from old-name");
    expect(state.files[1]).toContain("patch unavailable");
    expect(item.warnings).toContain("File list capped at 200 records.");
    expect(item.warnings.some((warning) => warning.includes("truncated"))).toBe(
      true,
    );
    expect(
      item.warnings.some((warning) => warning.includes("unavailable")),
    ).toBe(true);
  });

  it("exposes only additive label writes", () => {
    const source = readFileSync(
      new URL("../src/github.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/issues\.addLabels/);
    expect(source).not.toMatch(
      /removeLabels|setLabels|createLabel|updateLabel/,
    );
  });
});
