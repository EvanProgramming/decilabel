import { describe, expect, it, vi } from "vitest";
import {
  batchQuestions,
  buildQuestions,
  callDecisions,
} from "../src/decisions.js";
import type { Label } from "../src/types.js";

const labels: Label[] = Array.from({ length: 20 }, (_, i) => ({
  id: `id${i}`,
  name: `label-${i}`,
  description: `Description ${i}`,
}));

describe("Decisions contract", () => {
  it("splits candidates deterministically into at most 16 questions per request", () => {
    const questions = labels.map((label, i) => ({
      id: `q${i}`,
      type: "noul" as const,
      labelIds: [label.id],
      text: label.name,
    }));
    const batches = batchQuestions(questions);
    expect(batches.map((batch) => batch.length)).toEqual([16, 4]);
    expect(batches.flat().map((q) => q.id)).toEqual(questions.map((q) => q.id));
  });
  it("builds one Noul per label and a fixed Choice with an internal none option", () => {
    const qs = buildQuestions(
      labels.slice(0, 3),
      [["label-0", "label-1"]],
      [],
      false,
    );
    expect(qs).toHaveLength(2);
    expect(qs[0]?.criteria).toEqual({
      o0: "label-0: Description 0",
      o1: "label-1: Description 1",
      none: "None of these labels",
    });
    expect(qs[0]?.optionToLabel).toEqual({ o0: "id0", o1: "id1" });
    expect(qs[1]?.type).toBe("noul");
  });

  it("skips a group already represented on the issue and limits choices to seven labels", () => {
    const occupied = buildQuestions(
      labels.slice(0, 3),
      [["label-0", "label-1"]],
      ["label-0"],
      false,
    );
    expect(occupied.every((question) => question.type === "noul")).toBe(true);
    expect(occupied.map((question) => question.labelIds)).toEqual([
      ["id1"],
      ["id2"],
    ]);
    expect(() =>
      buildQuestions(
        labels.slice(0, 8),
        [[...labels.slice(0, 8).map((l) => l.name)]],
        [],
        false,
      ),
    ).toThrow(/100|options|eight/);
    expect(() =>
      buildQuestions(
        Array.from({ length: 101 }, (_, i) => ({
          id: `id${i}`,
          name: `label-${i}`,
          description: "",
        })),
        [],
        [],
        true,
      ),
    ).toThrow(/100/);
  });

  it.each(["typesafe/jev-1.13", "microsoft/microsoft-decision-1"])(
    "sends the ID-keyed Decisions contract for %s",
    async (model) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            answers: {
              q1: { type: "noul", noul: 0.81 },
              q2: {
                type: "choice",
                choice: "o0",
                probabilities: { o0: 0.8, none: 0.2 },
              },
            },
          }),
          { status: 200 },
        ),
      );
      const questions = [
        {
          id: "q1",
          type: "noul" as const,
          labelIds: ["id0"],
          text: "supports label",
        },
        {
          id: "q2",
          type: "choice" as const,
          labelIds: ["id0"],
          noneId: "none",
          optionToLabel: { o0: "id0" },
          criteria: { o0: "bug", none: "none" },
          text: "choose",
        },
      ];
      const answers = await callDecisions(
        model,
        { title: "x" },
        questions,
        "secret",
        fetcher,
      );
      expect(answers.q1).toEqual({ type: "noul", noul: 0.81 });
      expect(answers.q2).toMatchObject({
        type: "choice",
        choice: "o0",
        probabilities: { o0: 0.8 },
      });
      const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
      expect(body.model).toBe(model);
      expect(body.questions.q1).toEqual({
        type: "noul",
        instructions: "supports label",
      });
      expect(body.questions.q2.criteria).toHaveProperty("none");
    },
  );

  it("uses TypeSafe's direct Jev endpoint and model alias", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ answers: { q: { type: "noul", noul: 1 } } }),
        {
          status: 200,
        },
      ),
    );
    await callDecisions(
      "typesafe/jev-1.13",
      {},
      [{ id: "q", type: "noul", labelIds: ["id0"], text: "supports" }],
      "secret",
      fetcher,
      undefined,
      "typesafe",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.typesafe.ai/v1/systemone",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).model).toBe(
      "jev-latest",
    );
  });

  it("maps typed questions to OpenAI Decisions and normalizes its answer array", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            answers: [
              { type: "predicate", name: "q1", probability: 0.81 },
              {
                type: "choice",
                name: "q2",
                choice: "o0",
                probabilities: [
                  { value: "o0", probability: 0.8 },
                  { value: "none", probability: 0.2 },
                ],
                confidence: 0.9,
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const answers = await callDecisions(
      "gpt-6-luna",
      { title: "x" },
      [
        { id: "q1", type: "noul", labelIds: ["id0"], text: "supports label" },
        {
          id: "q2",
          type: "choice",
          labelIds: ["id0"],
          noneId: "none",
          optionToLabel: { o0: "id0" },
          criteria: { o0: "bug", none: "none" },
          text: "choose",
        },
      ],
      "secret",
      fetcher,
      Date.now() + 10_000,
      "openai",
    );

    expect(answers).toEqual({
      q1: { type: "noul", noul: 0.81 },
      q2: {
        type: "choice",
        choice: "o0",
        probabilities: { o0: 0.8, none: 0.2 },
        confidence: 0.9,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/decisions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      model: "gpt-6-luna",
      input: '{"title":"x"}',
      questions: [
        { type: "predicate", name: "q1", instructions: "supports label" },
        {
          type: "choice",
          name: "q2",
          instructions: "choose",
          choices: [
            { value: "o0", description: "bug" },
            { value: "none", description: "none" },
          ],
        },
      ],
    });
  });

  it("treats OpenAI refusals and omitted answers as abstentions", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: [{ type: "refusal", name: "q1" }],
        }),
        { status: 200 },
      ),
    );
    const answers = await callDecisions(
      "gpt-6-luna",
      {},
      [
        { id: "q1", type: "noul", labelIds: ["id0"], text: "supports" },
        { id: "q2", type: "noul", labelIds: ["id1"], text: "supports" },
      ],
      "secret",
      fetcher,
      undefined,
      "openai",
    );
    expect(answers.q1).toBeUndefined();
    expect(answers.q2).toBeUndefined();
  });

  it("rejects malformed OpenAI answer payloads without exposing response data", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ answers: {} }), { status: 200 }),
      );
    await expect(
      callDecisions(
        "gpt-6-luna",
        {},
        [{ id: "q", type: "noul", labelIds: ["id0"], text: "supports" }],
        "secret",
        fetcher,
        undefined,
        "openai",
      ),
    ).rejects.toThrow(/malformed response/);
  });

  it("retries transient responses at most three times and stops on malformed responses", async () => {
    const question = [
      { id: "q", type: "noul" as const, labelIds: ["id0"], text: "supports" },
    ];
    const retrying = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ answers: { q: { type: "noul", noul: 0.8 } } }),
          { status: 200 },
        ),
      );
    expect(
      (
        await callDecisions(
          "typesafe/jev-1.13",
          {},
          question,
          "secret",
          retrying,
        )
      ).q,
    ).toMatchObject({ noul: 0.8 });
    expect(retrying).toHaveBeenCalledTimes(3);
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ answers: [] }), { status: 200 }),
      );
    await expect(
      callDecisions("typesafe/jev-1.13", {}, question, "secret", malformed),
    ).rejects.toThrow(/malformed/);
    expect(malformed).toHaveBeenCalledTimes(1);
  });

  it("stops immediately on authentication errors and enforces state and deadline limits", async () => {
    const question = [
      { id: "q", type: "noul" as const, labelIds: ["id0"], text: "supports" },
    ];
    const unauthorized = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("provider secret response", { status: 401 }),
      );
    await expect(
      callDecisions("typesafe/jev-1.13", {}, question, "secret", unauthorized),
    ).rejects.toThrow(/HTTP 401/);
    expect(unauthorized).toHaveBeenCalledTimes(1);
    await expect(
      callDecisions(
        "typesafe/jev-1.13",
        "x".repeat(16_385),
        question,
        "secret",
        unauthorized,
      ),
    ).rejects.toThrow(/16 KB/);
    await expect(
      callDecisions(
        "typesafe/jev-1.13",
        {},
        question,
        "secret",
        unauthorized,
        Date.now() - 1,
      ),
    ).rejects.toThrow(/deadline/);
  });
});
