# Codex Heatmap Matrix — Cert Notes (resubmission wave, Phase 01)

**Version:** 1.1.0.27 (visual.version) · production GUID unchanged (`codexHeatmapMatrix…`) · API 5.11.0 / pbiviz 7.0.2 (pinned).

One-wave AppSource resubmission carrying the transparency/formatting rework **and** the v2 appearance redesign. Partner Center re-evaluates the whole package (Pitfall 6).

## Transparency wave (Plans 07–08)
- New **Background** card: `ColorPicker` fill + 0–100 `transparency` slider via `hexToRGBString`. Additive.
- fx conditional formatting wired on eligible colour properties.

## Title + per-region text wave (Plan 14)
- Title + per-region text treatment reworked with adaptive text colour.

## v2 Appearance wave (Plan 18)
- Single-hue perceptual ramp via `heatmapRamp()` (Sequential / Custom); literal RAG via `ragScale`; cell-ink auto-flip (t>0.55 → dark ink, t<0.45 → light ink); cyan hover ring; HC uses **density hatching** instead of hue.
- **D-16:** the Colour Scheme's declared default flips Green-to-Red → **Sequential** (the v2 single-hue look); Green-to-Red / Red-to-Green keep their literal RAG-diverging meaning via `ragScale`; **Mid Colour** is superseded but remains in the pane (zero property removal). An explicit Cell Value Colour fx rule or swatch override always beats the ink auto-flip.

## High-contrast rule
Shared HC rule wired (`src/shared/highContrast.ts`).

## CERT-01 regression guard (protected logic)
The **dual-listener contextmenu block** is **byte-unchanged** through all three waves. Empty-space right-click context menu confirmed intact (Task 1, Neil-verified).

## CERT-03 (human-gated)
`CodexHeatmapMatrix_Sample.pbix` must be re-embedded with this 1.1.0.27 build so the embedded visual version matches the submitted `pbiviz.json`. Requires PBI Desktop (Windows) — see SUMMARY manual-steps.

## Pending fixes riding this wave
None outstanding (PENDING-FIXES: nothing pending).
