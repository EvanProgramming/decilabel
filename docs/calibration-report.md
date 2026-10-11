# DeciLabel real-example calibration

**Evaluation status:** pending the read-only `Jev calibration` workflow run. The current production threshold is `0.67`, still provisional until the live sweep completes.

## Method

The benchmark uses 24 real, closed items from [EvanProgramming/OpenKyrozen](https://github.com/EvanProgramming/OpenKyrozen): eight Issues and eight pull requests with maintainer-applied labels, plus eight unlabeled challenge items. The 16 labeled items form the scored set. The challenge items are reported separately and never treated as known negatives.

The workflow fetches the current item snapshots and repository label taxonomy using the same DeciLabel GitHub context builder used in production. It evaluates all current, non-default-excluded labels, omitting only `review:*` labels because those are automated ghfind review scores rather than issue taxonomy. It runs the real Decisions question builder and policy with a three-new-label ceiling, then sweeps thresholds `0.50` through `0.95` in `0.05` steps, including the deployed `0.67` cutoff. The calls run serially and read-only; no issue or pull-request labels are changed.

TypeSafe Jev is evaluated through the direct TypeSafe API. Microsoft Decision 1 is also evaluated through OpenRouter if `OPENROUTER_API_KEY` is configured. A shared cutoff is reported only when both models meet the gate. The TypeSafe-only cutoff is reported separately if OpenRouter credentials are absent.

For each threshold, precision and recall are micro-averaged over accepted label assignments, after the Action's ranking and label ceiling. Abstention is the count of labeled examples with no selected labels. The quality gate is the lowest threshold with at least `95%` observed precision and ten or more correct accepted label assignments per evaluated model.

## Scored examples

The gold labels below are the repository's current labels for each closed item, excluding default exclusions and automated `review:*` labels.

| Type  | Example                                                           | Gold labels                                                                                                      |
| ----- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Issue | [#209](https://github.com/EvanProgramming/OpenKyrozen/issues/209) | `bug`, `P2`, `area: tasks`                                                                                       |
| Issue | [#216](https://github.com/EvanProgramming/OpenKyrozen/issues/216) | `bug`, `enhancement`, `regression`, `area:cli`                                                                   |
| Issue | [#223](https://github.com/EvanProgramming/OpenKyrozen/issues/223) | `enhancement`, `P2`, `area: testing`, `area: tools`                                                              |
| Issue | [#150](https://github.com/EvanProgramming/OpenKyrozen/issues/150) | `bug`, `P3`, `area: web-ui`                                                                                      |
| Issue | [#164](https://github.com/EvanProgramming/OpenKyrozen/issues/164) | `bug`, `P1`, `area: cli`, `regression`                                                                           |
| Issue | [#139](https://github.com/EvanProgramming/OpenKyrozen/issues/139) | `documentation`, `P3`, `area: providers`                                                                         |
| Issue | [#79](https://github.com/EvanProgramming/OpenKyrozen/issues/79)   | `bug`, `documentation`, `P2`, `area: providers`, `area: cost`                                                    |
| Issue | [#75](https://github.com/EvanProgramming/OpenKyrozen/issues/75)   | `bug`, `documentation`, `P2`, `area: installation`, `area: testing`                                              |
| PR    | [#270](https://github.com/EvanProgramming/OpenKyrozen/pull/270)   | `enhancement`, `P0`, `area: providers`                                                                           |
| PR    | [#224](https://github.com/EvanProgramming/OpenKyrozen/pull/224)   | `bug`, `enhancement`, `P2`, `P1`, `area: tasks`, `area: providers`, `area: cost`, `area: testing`, `area: tools` |
| PR    | [#176](https://github.com/EvanProgramming/OpenKyrozen/pull/176)   | `bug`, `P0`, `area: tasks`                                                                                       |
| PR    | [#197](https://github.com/EvanProgramming/OpenKyrozen/pull/197)   | `bug`, `documentation`, `P2`, `area: testing`                                                                    |
| PR    | [#195](https://github.com/EvanProgramming/OpenKyrozen/pull/195)   | `bug`, `P0`, `area: tasks`, `area: providers`, `area: cli`, `regression`                                         |
| PR    | [#179](https://github.com/EvanProgramming/OpenKyrozen/pull/179)   | `P1`, `area: testing`, `regression`                                                                              |
| PR    | [#178](https://github.com/EvanProgramming/OpenKyrozen/pull/178)   | `bug`, `P2`, `area: cli`                                                                                         |
| PR    | [#174](https://github.com/EvanProgramming/OpenKyrozen/pull/174)   | `bug`, `P0`, `area: tasks`, `area: cli`, `regression`                                                            |

## Unlabeled challenge examples

These are useful to inspect whether the models abstain on items with no human-assigned taxonomy labels. Their missing labels are not considered proof that every candidate label is wrong.

- [Issue #218](https://github.com/EvanProgramming/OpenKyrozen/issues/218)
- [PR #273](https://github.com/EvanProgramming/OpenKyrozen/pull/273)
- [PR #272](https://github.com/EvanProgramming/OpenKyrozen/pull/272)
- [PR #269](https://github.com/EvanProgramming/OpenKyrozen/pull/269)
- [PR #221](https://github.com/EvanProgramming/OpenKyrozen/pull/221)
- [PR #220](https://github.com/EvanProgramming/OpenKyrozen/pull/220)
- [PR #219](https://github.com/EvanProgramming/OpenKyrozen/pull/219)
- [PR #217](https://github.com/EvanProgramming/OpenKyrozen/pull/217)

## Results

The live results table and selected threshold will be added here after the workflow completes. Its 30-day artifact contains item URLs, labels, probabilities, deterministic policy reasons, and aggregate scores. It does not contain Issue bodies, PR diffs, credentials, or raw provider payloads.

## Interpretation and limits

This small, manually selected holdout tests a real but narrow taxonomy from one repository. Closed-item labels can be incomplete, and the examples are not a random sample of future traffic. The challenge set has no verified negative labels. Precision and recall here are observed benchmark metrics, not probability calibration, and a passing threshold does not establish performance on other repositories or taxonomies. Provider model aliases can change over time; retain each workflow artifact with its run date when comparing later evaluations.

The calibration workflow redacts common credential formats from fetched evidence before provider submission. That filter is defense in depth, not a guarantee that every possible secret format is detected; the source repository is public, and its Issue/PR contents and available diff excerpts are sent to the evaluated provider.
