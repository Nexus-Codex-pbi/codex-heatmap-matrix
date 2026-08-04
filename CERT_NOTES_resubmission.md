# Codex Heatmap Matrix — Cert Notes (resubmission after 1180.2.4)

**Version:** 1.1.0.32 (visual.version) · production GUID unchanged (`codexHeatmapMatrix…`) · API 5.11.0 / pbiviz 7.0.2 (pinned).
**Source repository:** https://github.com/Nexus-Codex-pbi/codex-heatmap-matrix

Resubmission of 1.1.0.29, returned on **2026-08-03** under policy **1180.2.4 Data
Types**: the visual stopped responding on a large dataset. This build fixes that,
and three further data-type defects found while auditing the rest of the policy.
No `capabilities.json` change — the production GUID locks the schema, and no data
role, mapping or property was added, removed or altered.

---

## 1. Unresponsive on large data — the reported failure

**Cause.** Cost scaled with rendered **cells**, and cells are
`uniqueRows × uniqueColumns`. Row count was never the problem: a million rows over
Region × Month is a 144-cell grid. But a high-cardinality field on either axis —
the review bound a numeric column to Column Category — expands the grid without
limit, and at the declared 30,000-row reduction cap that meant up to 30,000 `<td>`
nodes, each with ~10 inline style writes, built synchronously. That blocks the
iframe, and the canvas never repaints.

**Fix (a) — the grid is bounded.** 5,000 cells, 200 per axis, both axes shrunk
proportionally so the grid keeps its shape instead of collapsing to a strip. The
policy's stated remedy is "paginate, cap, or use virtualization"; this caps.
No legible heatmap approaches that size — 200 × 25 renders in full.

**Truncation is stated on the canvas**, never silent: *"Showing 70 of 30,000 rows
and 70 of 900 columns. Filter the data or use lower-cardinality fields to see all
of it."* A heatmap that quietly drops most of its data looks complete and is not,
which is a worse failure than the hang because nobody notices it.

**Fix (b) — the per-row parse is cheaper**, which matters for legitimate large
datasets rather than for this test: a nested row→column index replaces a
`` `${row}|${col}` `` key (one throwaway string per source row), single map lookups
replace `has()`+`get()`+`set()`, `String()` is skipped for values already strings,
and `Number.isFinite` replaces the coercing global.

Measured, before → after: 100k rows 37→21ms, 1M rows 285→114ms, 1M rows with high
cardinality 543→157ms.

## 2. Blank cells rendered as zero

`Number(null)` and `Number("")` both coerce to `0`, so a null cell painted as a
measured zero and printed "0" — the visual asserting a real value of nothing where
the truth was no data. Blanks (null, undefined, empty and whitespace-only strings)
now render empty. **A genuine 0 still prints 0**, and the two are now
distinguishable.

## 3. Text values rendered blank

The Cell Value well accepts a text column, and the value then arrives as a string.
`Number("North")` is `NaN`, so the cell rendered blank. Text cells now display their
string, taking the same fill as an empty cell — a string has no position on the
colour ramp, and that fill already means "no numeric value". They route through the
existing high-contrast, theming, transparency and per-cell conditional-formatting
paths, so they style exactly as numeric cells do. Tooltips show the string.

*Disclosure:* this behaviour existed in 1.1.0.0, which passed the April 2026 review,
and was lost in a later refactor. The call sites now name the policy in-source so a
future refactor cannot remove it unremarked.

## 4. Verified unchanged in the same audit

- **Negative values** ramp correctly and are included in the colour domain.
- **Large magnitudes** render in full via `toLocaleString`, not abbreviated.
- **Numeric strings** (`"12.5"`) still parse as numbers rather than diverting to the
  text branch.
- `dataReductionAlgorithm.top.count` remains at the platform maximum of 30,000.

Twelve input shapes were verified end to end: null, undefined, empty string,
whitespace, real zero, string zero, negatives, large magnitudes, text, numeric
strings, and ordinary values.

## `supportsHighlight` is `false` by design

`pbiviz package` emits a "Highlight Data" recommendation. It is declined
deliberately: declaring `supportsHighlight: true` without honouring the highlight
array in the renderer is itself a 1180.2.2 finding, and a sibling visual in this
suite was returned for exactly that. The flag will be set when the renderer
genuinely dims un-highlighted cells.

---

## Carried forward, unchanged in this build

**Transparency (Plans 07–08):** Background card, `ColorPicker` fill + 0–100
transparency slider via `hexToRGBString`. Additive. fx conditional formatting on
eligible colour properties.

**Title + per-region text (Plan 14):** reworked with adaptive text colour.

**v2 appearance (Plan 18):** single-hue perceptual ramp via `heatmapRamp()`
(Sequential / Custom); literal RAG via `ragScale`; cell-ink auto-flip; cyan hover
ring; high contrast uses density hatching instead of hue.

**D-16:** Colour Scheme default is **Sequential**, flipped from Green-to-Red.
Green-to-Red / Red-to-Green retain their literal RAG-diverging meaning via
`ragScale`. **Mid Colour** is superseded but remains in the pane — no property was
removed. An explicit Cell Value Colour fx rule or swatch override beats the ink
auto-flip.

**High contrast:** shared rule wired (`src/shared/highContrast.ts`).

**CERT-01 regression guard:** the dual-listener contextmenu block is byte-unchanged
through every wave including this one. Empty-space right-click context menu intact.

---

## ⛔ INTERNAL — strip before sending

**Upload discipline:** upload the `.pbix` and the `.pbiviz` **one at a time,
verifying each landed before saving**. Partner Center silently drops the second file
of a back-to-back pair and retains the previous one — that is what got Bullet Chart
returned on 2026-08-03.

**Pre-flight:** `python3 scripts/preflight-sample-embed.py` must exit 0. Currently
green — `.pbiviz` 1.1.0.32, embedded 1.1.0.32.

**Sample state:** Page 1 unchanged (source of the 1366×768 listing stills). Data
Testing Page carries the text case via the `Activity Status` measure. Null, negative
and big-number cases are covered by code audit and the twelve-shape verification,
not by sample data.

**Riders:** none.
