# Codex Heatmap Matrix — Cert Notes (resubmission after 1180.2.4)

**Version:** 1.1.0.30 (visual.version) · production GUID unchanged (`codexHeatmapMatrix…`) · API 5.11.0 / pbiviz 7.0.2 (pinned).
**Source repository:** https://github.com/Nexus-Codex-pbi/codex-heatmap-matrix

Resubmission of 1.1.0.29, which was returned on **2026-08-03** under policy
**1180.2.4 Data Types**. This build addresses that finding. Nothing else changed — the
v2 appearance package carried by 1.1.0.27–29 is unmodified, and is summarised again
below because Partner Center re-evaluates the whole package (Pitfall 6).

---

## 1180.2.4 Data Types — what was wrong and what changed

**The defect.** The **Cell Value** well accepts a text column, not only a measure. When
it held text, the value reached the render path as a string, was coerced with a bare
`Number(rawVal)`, became `NaN`, and the cell rendered blank.

**The change** (`src/visual.ts`, commit `e57dd2a`):

- The parse loop now detects a non-numeric string
  (`typeof rawVal === "string" && isNaN(Number(rawVal))`) and holds it in a parallel
  `stringDataMap`, forcing the numeric value to `NaN` so the cell is excluded from the
  colour-ramp domain rather than distorting it.
- The render loop gained a text-cell branch ahead of the numeric branch. Text cells
  display their string and take the same fill as a zero/null cell — that fill already
  means "no numeric value", which is what a text cell is. The branch routes through the
  existing high-contrast path, `zeroColorHelper`, `cellLabelColorHelper` and the
  transparency helper, so theming, cell transparency and per-cell conditional
  formatting apply to text cells exactly as they do to numeric ones.
- Tooltips on text cells show the string rather than the em-dash placeholder.

**Disclosure.** This behaviour was present in 1.1.0.0, which passed the April 2026
review, and was lost in a later refactor of `visual.ts`. That is why the same test
passed then and failed now. It is restored here, and the call sites now carry the
policy number in-source so a future refactor cannot remove it unremarked.

**Behaviour deliberately unchanged:**

- Numeric strings (e.g. `"12.5"`) still parse as numbers and take their place on the
  colour ramp — they are not diverted to the text path.
- Empty strings, whitespace, `null` and `0` keep their existing zero/null rendering.
- No `capabilities.json` change. The production GUID locks the schema; no data role,
  mapping or property was added, removed or altered.

**The other half of the April 1180.2.4 finding** — large-data handling — remains in
place: `dataReductionAlgorithm.top.count` is `30000`, the platform maximum.

## Where to verify it in the sample

`CodexHeatmapMatrix_Sample.pbix` includes a text column bound to **Cell Value**. Those
cells render their text on the neutral zero/null fill, while the numeric grid is
unaffected. Changing the Colour Scheme, the transparency slider or the report theme
shows the text cells tracking the same styling as the rest of the grid.

## `supportsHighlight` is `false` by design

`pbiviz package` emits a "Highlight Data" recommendation. It is declined deliberately.
Declaring `supportsHighlight: true` without honouring the highlight array in the
renderer is itself a 1180.2.2 finding — a sibling visual in this suite was returned for
exactly that. The flag will be set only when the renderer genuinely dims
un-highlighted cells.

---

## Carried forward from the v2 wave (unchanged in this build)

**Transparency (Plans 07–08):** Background card with `ColorPicker` fill + 0–100
transparency slider via `hexToRGBString`. Additive. fx conditional formatting wired on
eligible colour properties.

**Title + per-region text (Plan 14):** reworked with adaptive text colour.

**v2 appearance (Plan 18):** single-hue perceptual ramp via `heatmapRamp()`
(Sequential / Custom); literal RAG via `ragScale`; cell-ink auto-flip (t>0.55 → dark
ink, t<0.45 → light ink); cyan hover ring; high contrast uses density hatching instead
of hue.

**D-16:** the Colour Scheme's declared default is **Sequential** (the v2 single-hue
look), flipped from Green-to-Red. Green-to-Red / Red-to-Green retain their literal
RAG-diverging meaning via `ragScale`. **Mid Colour** is superseded but remains in the
pane — no property was removed. An explicit Cell Value Colour fx rule or swatch
override always beats the ink auto-flip.

**High contrast:** shared rule wired (`src/shared/highContrast.ts`).

**CERT-01 regression guard:** the dual-listener contextmenu block is byte-unchanged
through every wave, including this one. Empty-space right-click context menu intact.

---

## ⛔ INTERNAL — pre-submission gate (strip before sending)

**Do not submit until the sample `.pbix` actually contains a text column bound to Cell
Value.** As of 2026-08-03 it does not — the "Where to verify it" section above
describes the required state, not the current one. `reembed_pbiviz.py` swapped the
embedded binary to 1.1.0.30 but cannot add a field-well binding; that needs PBI
Desktop. Submitting without it means the reviewer re-runs the same numeric grid and
returns the same finding.

**Upload discipline:** upload the `.pbix` and the `.pbiviz` **one at a time, verifying
each landed before saving**. Partner Center silently drops the second file of a
back-to-back pair and retains the previous one — that is what got Bullet Chart returned
on 2026-08-03.

**Pre-flight:** `python3 scripts/preflight-sample-embed.py` must exit 0. Currently
green — `.pbiviz` 1.1.0.30, embedded 1.1.0.30.

**Riders:** none. No other pending fix is carried by this build.
