# DeciLabel real-example calibration

**Evaluation status:** Jev-only quality gate passed at `0.92` in two live runs. The direct-TypeSafe workflow uses `0.92`; the generic Action default remains `0.67` because OpenRouter/Microsoft was not evaluated.

## Method

The benchmark uses 24 real, closed items from [EvanProgramming/OpenKyrozen](https://github.com/EvanProgramming/OpenKyrozen): eight Issues and eight pull requests with maintainer-applied labels, plus eight unlabeled challenge items. The 16 labeled items form the scored set. The challenge items are reported separately and never treated as known negatives.

The workflow fetches the current item snapshots and repository label taxonomy using the same DeciLabel GitHub context builder used in production. It evaluates all current, non-default-excluded labels, omitting only `review:*` labels because those are automated ghfind review scores rather than issue taxonomy. It runs the real Decisions question builder and policy with a three-new-label ceiling, then sweeps every threshold from `0.00` through `1.00` in `0.01` steps. The initial run used a coarser grid; its retained probabilities were also re-evaluated at their exact score breakpoints. The calls run serially and read-only; no issue or pull-request labels are changed.

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

Both live runs used TypeSafe Jev 1.13 against the same 16 labeled items, 8 unlabelled challenges, and 31 candidate labels. The lowest displayed 0.01-step cutoff meeting the gate was `0.92` in each run. The exact breakpoint analysis of run 1 found the first passing point just above `0.91`; `0.92` is the practical, repeatable cutoff.

| Threshold | Run 1 TP / FP / FN |  Precision |    Recall |  Abstained | Run 2 TP / FP / FN |  Precision |    Recall |  Abstained |
| --------: | -----------------: | ---------: | --------: | ---------: | -----------------: | ---------: | --------: | ---------: |
|      0.67 |       25 / 11 / 41 |      69.4% |     37.9% |     0 / 16 |       25 / 10 / 41 |      71.4% |     37.9% |     0 / 16 |
|      0.70 |       24 / 10 / 42 |      70.6% |     36.4% |     0 / 16 |       24 / 10 / 42 |      70.6% |     36.4% |     0 / 16 |
|      0.80 |        20 / 9 / 46 |      69.0% |     30.3% |     2 / 16 |        20 / 9 / 46 |      69.0% |     30.3% |     2 / 16 |
|      0.90 |        14 / 5 / 52 |      73.7% |     21.2% |     6 / 16 |        14 / 4 / 52 |      77.8% |     21.2% |     6 / 16 |
|      0.91 |        13 / 3 / 53 |      81.3% |     19.7% |     6 / 16 |        13 / 2 / 53 |      86.7% |     19.7% |     7 / 16 |
|  **0.92** |    **12 / 0 / 54** | **100.0%** | **18.2%** | **7 / 16** |    **11 / 0 / 55** | **100.0%** | **16.7%** | **7 / 16** |
|      0.93 |        10 / 0 / 56 |     100.0% |     15.2% |     8 / 16 |         9 / 0 / 57 |     100.0% |     13.6% |     9 / 16 |
|      0.95 |         3 / 0 / 63 |     100.0% |      4.5% |    14 / 16 |         3 / 0 / 63 |     100.0% |      4.5% |    13 / 16 |

Both runs pass the Jev-specific gate at `0.92`: at least ten correct accepted labels and at least 95% observed precision. Neither run passes at `0.91`. At `0.67`, the model also selected 23 labels across the eight unlabeled challenge items; those are not counted as measured errors, but the volume argues against using that lower cutoff as a high-precision setting.

The original [coarser-grid run](https://github.com/EvanProgramming/decilabel/actions/runs/38110641758) and the [0.01-grid repeat](https://github.com/EvanProgramming/decilabel/actions/runs/38110846309) completed successfully. Each run's 30-day artifact contains item URLs, labels, probabilities, deterministic policy reasons, and aggregate scores. It does not contain Issue bodies, PR diffs, credentials, or raw provider payloads.

The cross-model/shared quality gate remains unverified: no `OPENROUTER_API_KEY` was configured for these runs, so Microsoft Decision 1 was not evaluated.

## Interpretation and limits

This small, manually selected holdout tests a real but narrow taxonomy from one repository. Closed-item labels can be incomplete, and the examples are not a random sample of future traffic. Scored PR #224 is linked to scored Issue #223, so the 16 labeled items represent 15 distinct underlying tasks. The two runs repeat the same items, so they show response variation rather than adding independent examples. The challenge set has no verified negative labels. Precision and recall here are observed benchmark metrics, not probability calibration; `0.92` met the defined Jev cutoff on this dataset, but recall was only 16.7–18.2%. It is a high-precision, low-coverage operating point, not evidence that Jev is broadly calibrated or that `0.92` transfers to other repositories or models. Provider model aliases can change over time; retain each workflow artifact with its run date when comparing later evaluations.

The calibration workflow redacts common credential formats from fetched evidence before provider submission. That filter is defense in depth, not a guarantee that every possible secret format is detected; the source repository is public, and its Issue/PR contents and available diff excerpts are sent to the evaluated provider.
