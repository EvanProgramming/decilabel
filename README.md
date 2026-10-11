# DeciLabel

DeciLabel classifies GitHub Issues and pull requests with a typed Decisions API, then adds only labels supported by the available evidence. Use OpenRouter (the default) or Jev through TypeSafe's direct API. It never removes, replaces, or creates labels. It runs as a Node 24 GitHub Action and includes its dependencies in `dist/index.js`.

## Quick start

Create an `OPENROUTER_API_KEY` repository secret and add a workflow like [the minimal example](examples/minimal.yml). For direct Jev access, create a `TYPESAFE_API_KEY` secret and set `provider: typesafe` with `typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}`. Replace `OWNER/DeciLabel` and `FULL_40_CHARACTER_COMMIT_SHA` with the repository and a verified full commit SHA after installing DeciLabel. The workflow listens to Issues and `pull_request_target`, grants only label-write permissions, uses per-item concurrency, and does not check out or run submitted code.

The workflow handles these events:

- Issues: `opened`, `edited`, `reopened`
- Pull requests: `opened`, `edited`, `synchronize`, `reopened`, `ready_for_review`

### Allowing the workflow to run

For public repositories, GitHub is rolling out workflow execution protections that can prevent `pull_request_target` from starting. The announced enforcement date is **November 2, 2026**. In **Settings → Actions → Policies**, allow the DeciLabel workflow's specific events and review actor restrictions for outside contributors and any inherited organization or enterprise policies. See GitHub's [workflow execution policy guidance](https://docs.github.com/en/actions/how-tos/administer/control-workflow-execution).

A policy-blocked workflow never starts, so DeciLabel cannot report the block from inside a run. Check Actions policy insights and repository/organization policy configuration when no run appears.

## Models and decisions

The default `provider: openrouter` supports model IDs `typesafe/jev-1.13` and `microsoft/microsoft-decision-1` through `POST https://openrouter.ai/api/alpha/decisions`. Set `provider: typesafe` to call TypeSafe's direct `POST https://api.typesafe.ai/v1/systemone` API with the `typesafe-api-key` secret; this provider uses TypeSafe's `jev-latest` alias and supports Jev only. Both APIs use the same typed Decisions request and answer contract. Neither path calls chat/completions. DeciLabel asks a Noul yes-probability question for each independent candidate label. For each unoccupied exclusive group, it asks one Choice question with an internal none option. Labels and descriptions are inserted as data, not as executable instructions; only internal question and option IDs can map a response to a repository label.

Noul uses the probability of yes. Choice requires a complete probability distribution, a winning option, the configured threshold, and at least a `0.20` margin over the next option. Choice confidence is reported separately when supplied; it is not treated as the winning probability. Missing, malformed, unsupported, or uncertain answers abstain.

The default threshold is `0.70`. No provider credentials were available when this package was prepared, so model quality has **not been live-verified**. The repository includes 24 representative labeled examples (8 Issues, 8 pull requests, 8 ambiguous/adversarial cases), but they do not establish model calibration. A future live evaluation should run both OpenRouter models at 0.70, 0.80, and 0.90, select the lowest shared threshold with at least 95% observed precision and ten correct accepted labels per model, and report recall and abstention. If no threshold qualifies, the quality gate fails; a small sample is not a general calibration guarantee.

Model context figures conflict across provider materials. OpenRouter's Jev guide and catalog report 32,000 tokens; TypeSafe's model page reports 64,000 total with 32,000 for state plus the longest question. Microsoft Decision 1's catalog reports a 32,768-token context. DeciLabel records these provider statements separately rather than resolving the Jev discrepancy. Application limits are smaller and explicit: 100 candidate labels, 16 questions per request, eight Choice options including none, 16 KB serialized state, 24 KB serialized request, 15-second request timeout, no more than three attempts for transient/network failures, and a 120-second overall Decisions deadline. Requests are split deterministically; when there are over 100 candidates, use `include-labels` to narrow them.

References: [OpenRouter Decisions examples and Jev limits](https://openrouter.ai/blog/insights/what-is-jev/), [TypeSafe model limits](https://docs.typesafe.ai/models), and [Microsoft Decision 1 catalog](https://openrouter.ai/microsoft/microsoft-decision-1).

## Inputs

| Input                | Default               | Meaning                                                                                                                                                  |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openrouter-api-key` | OpenRouter only       | Required when `provider` is `openrouter`; sent only as a bearer token to OpenRouter.                                                                     |
| `provider`           | `openrouter`          | Decisions API provider: `openrouter` or `typesafe`.                                                                                                      |
| `typesafe-api-key`   | required for TypeSafe | TypeSafe secret; sent only as a bearer token to `api.typesafe.ai`.                                                                                       |
| `github-token`       | `${{ github.token }}` | Token used to read the item and add labels.                                                                                                              |
| `model`              | `typesafe/jev-1.13`   | OpenRouter model ID. TypeSafe mode accepts the default Jev ID and sends TypeSafe's `jev-latest` alias.                                                   |
| `threshold`          | `0.70`                | Probability threshold from 0 through 1.                                                                                                                  |
| `max-labels`         | `3`                   | Maximum eligible labels present after this run, counting existing eligible labels. Existing labels are preserved even if they already exceed this limit. |
| `include-labels`     | `[]`                  | Optional JSON array of existing repository label names. Empty means all eligible labels.                                                                 |
| `exclude-labels`     | `[]`                  | Additional JSON array of names to exclude. `duplicate`, `invalid`, `wontfix`, `good first issue`, and `help wanted` are always excluded.                 |
| `exclusive-groups`   | `[]`                  | JSON array of disjoint arrays of label names, for example `[["bug","feature"]]`. No exclusivity is inferred from label names.                            |
| `dry-run`            | `false`               | Perform classification and report results without writing labels.                                                                                        |

Names are resolved case-insensitively to current canonical repository labels. Unknown names, overlapping groups, and invalid configuration stop before any model call. Archived labels are ignored.

The [advanced example](examples/advanced.yml) shows all optional inputs.

## Policy and GitHub writes

Existing labels are left in place. `max-labels` controls only additional eligible assignments. A label is not considered again while it is already present.

DeciLabel reads the item's label timeline and tracks removals by stable label ID. A human removal vetoes automatic re-addition until a later human addition clears the veto. Bot actions do not set or clear that human choice; unknown removals conservatively veto. If timeline history is unavailable, malformed, or exceeds 1,000 relevant events, classification stops without a write. The action reads content, labels, and removal history again immediately before adding; changed title/body/state/head/base discards the old decision, and newly added or removed labels are rechecked.

The only write is GitHub's additive add-labels operation with a non-empty list. GitHub does not provide a transaction that combines the last history check with the addition, so a concurrent human removal can race that final write. Repeated runs may make another paid Decisions request because classification state is intentionally not persisted.

Pull request context contains title and body, changed-file counts, rename metadata, and patch excerpts (up to 200 files). The patch budget is distributed across available files. Missing patches, omitted files, and truncated excerpts are called out as coverage warnings. Missing diffs are never treated as proof that a file is unchanged; questions ask for affirmative support, and uncertain classifications abstain. A classification may still proceed when available evidence supports it.

## Outputs and privacy

Outputs are JSON strings for `selected-labels`, `added-labels`, and `results`, plus `status` and `skip-reason`. Each result carries its probability when available, optional provider confidence, PR coverage warnings, and a deterministic acceptance/rejection reason. `selected-labels` is the policy result; `added-labels` contains only labels actually submitted to GitHub. In dry-run mode no labels are added.

Issue/PR title, body, and available PR diff excerpts are sent to the selected provider (OpenRouter or TypeSafe) for classification. Do not use this Action for repositories whose content must not be sent to that provider. The Action does not log or include bodies, diffs, credentials, or raw provider payloads in the run summary; summaries contain status, selected labels, and sanitized result rows. Provider API keys are never written to outputs. There is no persistent classification store.

The `pull_request_target` workflow is intentionally small and does not check out pull request code, install dependencies, restore caches, or execute contributor scripts. Limit workflow permissions to the labels the Action needs, pin the Action to a verified commit SHA, and protect the secret and workflow file with repository policy.

## Troubleshooting

- **No run appears:** inspect Settings → Actions → Policies and inherited restrictions; an execution-policy block happens before the Action starts.
- **401/403 or permissions error:** verify the selected provider's secret (`OPENROUTER_API_KEY` or `TYPESAFE_API_KEY`), GitHub token permissions, and outside-contributor actor policy. Error bodies are intentionally not printed because they may contain request data.
- **Unknown label or invalid groups:** compare configured names with current repository labels; names are case-insensitive, but all must exist.
- **No labels selected:** inspect the summary's threshold and rejection reasons, exclusions, existing labels, groups, and PR coverage warnings. Try dry-run when changing a taxonomy.
- **History unavailable:** no labels are written when GitHub cannot provide complete, well-formed label history; check GraphQL access and retry the workflow.
- **More than 100 candidates / too many questions:** provide an include list that narrows the set. Requests are split into groups of at most 16 questions.
- **Repeated calls:** runs are stateless; edits, retries, and synchronization can incur another model call.

## Development

Node 24 is required. Run `npm ci` followed by `npm run check`. CI type-checks, lints, checks formatting, runs tests, builds the bundle, verifies committed build output, and smoke-tests `dist/index.js`. Consumer repositories do not need Node packages installed.

The committed bundle is built with `npm run build`; commit both `dist/index.js` and `dist/licenses.txt` after runtime changes. See [contribution guidance](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
