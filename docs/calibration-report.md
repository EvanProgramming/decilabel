# DeciLabel real-example calibration

**Evaluation status:** Three live Jev runs support a coverage-oriented cutoff of `0.91`; the direct-TypeSafe workflow now uses `0.91`. In all three runs, this point produced more accepted labels than `0.92` while keeping observed precision above the selected `80%` floor.

## Method

The benchmark uses 24 real, closed items from [EvanProgramming/OpenKyrozen](https://github.com/EvanProgramming/OpenKyrozen): eight Issues and eight pull requests with maintainer-applied labels, plus eight unlabeled challenge items. The 16 labeled items form the scored set. The challenge items are reported separately and never treated as known negatives.

The workflow fetches the current item snapshots and repository label taxonomy using the same DeciLabel GitHub context builder used in production. It evaluates all current, non-default-excluded labels, omitting only `review:*` labels because those are automated ghfind review scores rather than issue taxonomy. It runs the real Decisions question builder and policy with a three-new-label ceiling, then sweeps every threshold from `0.00` through `1.00` in `0.01` steps. The initial run used a coarser grid; its retained probabilities were also re-evaluated at their exact score breakpoints. The calls run serially and read-only; no issue or pull-request labels are changed.

TypeSafe Jev is evaluated through the direct TypeSafe API. Microsoft Decision 1 is also evaluated through OpenRouter if `OPENROUTER_API_KEY` is configured. A shared cutoff is reported only when both models meet the gate. The TypeSafe-only cutoff is reported separately if OpenRouter credentials are absent.

For each threshold, precision and recall are micro-averaged over accepted label assignments, after the Action's ranking and label ceiling. Abstention is the count of labeled examples with no selected labels. The previous run selected a high-precision point (at least `95%` precision and ten correct labels). This recalibration instead maximizes accepted-label coverage subject to at least `80%` observed precision and ten correct accepted labels. Ties favor more correct labels, then the lower threshold. The floor permits up to one observed false positive in five accepted labels on this small holdout; it is an explicit tradeoff, not a universal accuracy guarantee.

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

Three live runs evaluated TypeSafe Jev 1.13 on the same 16 labeled items, eight unlabeled challenges, and 31 candidate labels. The two earlier runs were precision-first sweeps; their stored probabilities were rescored under the new 80% coverage floor. The newest run performed the full live 0.01 grid under the coverage objective.

| Threshold | Run 1 TP / FP / FN | Precision |    Recall | Accepted | Run 2 TP / FP / FN | Precision |    Recall | Accepted | Run 3 TP / FP / FN | Precision |    Recall | Accepted |
| --------: | -----------------: | --------: | --------: | -------: | -----------------: | --------: | --------: | -------: | -----------------: | --------: | --------: | -------: |
|      0.67 |       25 / 11 / 41 |     69.4% |     37.9% |       36 |       25 / 10 / 41 |     71.4% |     37.9% |       35 |       25 / 10 / 41 |     71.4% |     37.9% |       35 |
|      0.90 |        14 / 5 / 52 |     73.7% |     21.2% |       19 |        14 / 4 / 52 |     77.8% |     21.2% |       18 |        13 / 4 / 53 |     76.5% |     19.7% |       17 |
|  **0.91** |    **13 / 3 / 53** | **81.3%** | **19.7%** |   **16** |    **13 / 2 / 53** | **86.7%** | **19.7%** |   **15** |    **13 / 1 / 53** | **92.9%** | **19.7%** |   **14** |
|      0.92 |        12 / 0 / 54 |    100.0% |     18.2% |       12 |        11 / 0 / 55 |    100.0% |     16.7% |       11 |        10 / 0 / 56 |    100.0% |     15.2% |       10 |

At `0.91`, each run accepts 14–16 labels, with 13 correct labels each time and observed precision from 81.3% to 92.9%. At `0.92`, the runs accept 10–12 labels, all correct, with recall from 15.2% to 18.2%. On the newest run, `0.91` adds four labels over `0.92`: three correct and one false positive; precision changes from 100% to 92.9%. This is the requested coverage tradeoff. The nearby `0.90` point fails the 80% precision floor in all three runs, so `0.91` is the lowest qualifying point among the tested grid in the repeated results.

The selected `0.91` cutoff is the coverage-maximizing qualifying point: among thresholds with at least 80% observed precision and ten correct accepted labels, choose the one with the largest number of accepted labels. Ties favor more true positives, then the lower threshold. The [first live run](https://github.com/EvanProgramming/decilabel/actions/runs/38110641758), [second live run](https://github.com/EvanProgramming/decilabel/actions/runs/38110846309), and [new coverage-oriented run](https://github.com/EvanProgramming/decilabel/actions/runs/38112527093) completed successfully. Their 30-day artifacts retain item URLs, labels, probabilities, deterministic policy reasons, and aggregate scores, not bodies, diffs, credentials, or raw provider payloads. The latest run selected 22 labels across eight unlabeled challenge examples at `0.67`; these are not counted as errors because their negative labels are unknown.

The cross-model/shared quality gate remains unverified: no `OPENROUTER_API_KEY` was configured for these runs, so Microsoft Decision 1 was not evaluated.

## Interpretation and limits

This small, manually selected holdout tests a real but narrow taxonomy from one repository. Closed-item labels can be incomplete, and the examples are not a random sample of future traffic. Scored PR #224 is linked to scored Issue #223, so the 16 labeled items represent 15 distinct underlying tasks. All three runs repeat the same items, so they show response variation rather than adding independent examples. The challenge set has no verified negative labels. Precision and recall here are observed benchmark metrics, not probability calibration; `0.91` met the chosen coverage floor on these runs, with 19.7% recall and 81.3–92.9% observed precision. This threshold is specific to Jev and this taxonomy; the 80% floor is a deliberate tolerance for false positives, not a broad quality guarantee. Provider aliases can change over time; retain each artifact with its run date when comparing later evaluations.

The calibration workflow redacts common credential formats from fetched evidence before provider submission. That filter is defense in depth, not a guarantee that every possible secret format is detected; the source repository is public, and its Issue/PR contents and available diff excerpts are sent to the evaluated provider.
