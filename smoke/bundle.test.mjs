import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

test("bundled entrypoint runs on Node 24 with mocked GitHub HTTP", () => {
  const temp = mkdtempSync(join(tmpdir(), "decilabel-smoke-"));
  const eventPath = join(temp, "event.json");
  const outputPath = join(temp, "output");
  const summaryPath = join(temp, "summary");
  writeFileSync(
    eventPath,
    JSON.stringify({
      repository: { name: "bar", owner: { login: "foo" } },
      issue: { number: 1 },
    }),
  );
  writeFileSync(outputPath, "");
  writeFileSync(summaryPath, "");
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      new URL("./mock-fetch.mjs", import.meta.url).pathname,
      new URL("../dist/index.js", import.meta.url).pathname,
    ],
    {
      env: {
        ...process.env,
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "issues",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "foo/bar",
        GITHUB_API_URL: "https://mock.github.invalid",
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
        "INPUT_OPENROUTER-API-KEY": "mock-secret",
        "INPUT_GITHUB-TOKEN": "mock-token",
        "INPUT_DRY-RUN": "false",
      },
      encoding: "utf8",
    },
  );
  const summary = existsSync(summaryPath)
    ? readFileSync(summaryPath, "utf8")
    : "";
  const output = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
  rmSync(temp, { recursive: true, force: true });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${summary}\n${output}\n${result.stdout}`, /no-eligible-labels/);
});
