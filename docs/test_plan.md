# Test Plan – Codex Heatmap Matrix

## 1. Functional Tests
- [ ] Visual loads without errors
- [ ] Visual renders with sample data
- [ ] Visual handles empty data gracefully
- [ ] All format pane options apply correctly
- [ ] Selection / cross-filter works (if applicable)
- [ ] Tooltips appear on hover

## 2. Performance Tests
- [ ] update() completes < 250ms
- [ ] No memory leaks
- [ ] Bundle size < 2.5 MB

## 3. Accessibility Tests
- [ ] Keyboard navigation works
- [ ] High contrast mode supported
- [ ] ARIA labels present
- [ ] No flashing content

## 4. Security Tests
- [ ] No external network calls
- [ ] No telemetry
- [ ] No external scripts or fonts
- [ ] No DOM escape or eval

## 5. Packaging Tests
- [ ] pbiviz builds successfully
- [ ] Bundle size < 2.5 MB
- [ ] capabilities.json valid

## 6. Sample PBIX Verification
- [ ] Demonstrates all features
- [ ] Demonstrates formatting options
- [ ] Demonstrates interactions

## 7. Outer Background Transparency (TRANS-01/02/03)
- [ ] Background card exposes Colour + Transparency (0-100) controls
- [ ] Transparency 0 = opaque (matches pre-upgrade default; old saved reports render pixel-identical)
- [ ] Transparency 50 shows report canvas bleeding through the container evenly
- [ ] Transparency 100 = fully transparent container
- [ ] Verified in both light and dark report themes

## 8. Per-Cell Transparency (D-05)
- [ ] Cell Transparency slider (Heatmap card) affects gradient cells AND zero/null cells identically
- [ ] Cell Transparency 0 = opaque (matches pre-upgrade default)
- [ ] Cell Transparency 100 = fully transparent cells, text values remain legible/readable
- [ ] Custom colour scheme (low/mid/high) interpolation still renders correctly at each transparency level

## 9. Conditional Formatting / fx (TRANS-04)
- [ ] Zero/Null Colour swatch shows the fx button in the format pane
- [ ] Setting a rule on Zero/Null Colour resolves per-cell for zero/null-valued cells
- [ ] Non-zero (gradient) cells are unaffected by the Zero/Null Colour rule (out of scope by design — gradient anchors are structural, not per-datapoint)

## 10. Context Menu Regression (CERT-01, verify-don't-rewrite)
- [ ] Right-click on a data cell shows the context menu
- [ ] Right-click on empty space within the container (e.g. below the table) shows the context menu
- [ ] Right-click outside the table but inside the visual's target bounding box shows the context menu
- [ ] Dual-listener block (`this.target` + `this.container`, lines ~53-63) is unchanged from before this plan (git diff confirms no edits to the constructor's contextmenu wiring)
- [ ] Right-click on the custom Title element shows the context menu (title is a child of `this.container`, so the container listener receives the bubbled contextmenu — no new dead zone)

## 11. Visual Title (TITLE-01, shared _shared/formatting/ v2)
- [ ] Visual Title card appears in the format pane (Show Title, Title Text, Font, Alignment, Font Color)
- [ ] Show Title default OFF — an old saved report renders pixel-identical (no title strip appears)
- [ ] Show Title ON + empty Title Text renders nothing (render gate is showTitle && titleText)
- [ ] Title font family/size/bold/italic/underline apply; alignment left/center/right applies
- [ ] Title migrated from the inline card to the shared TitleSettings — same property names, saved title settings from prior versions still load

## 12. Per-Surface Text Treatment (TEXT-01)
- [ ] Cell Value Font (family/size/bold/italic/underline) applies to numeric values inside cells
- [ ] Cell Bold OFF renders the pre-existing weight 500 (pixel-identical to old reports); Bold ON renders 700
- [ ] Cell Value Colour applies to cell text only — the cell fill gradient / zero colour is unchanged
- [ ] Header Font (family/size/bold/italic/underline) applies to both column headers and row labels
- [ ] Header Bold OFF renders each surface's own pre-existing weight (column header 700, row label 600); default Bold ON renders 700 (documented negligible +100 on row labels only when toggled)
- [ ] Header Font Colour still applies to both header surfaces (unchanged behaviour)
- [ ] Axis titles (Show Axis Titles) still render with header font size/colour (out of this plan's per-surface scope — unchanged)

## 13. Cell Value Colour fx (TEXT-02)
- [ ] Cell Value Colour swatch shows the fx button in the format pane
- [ ] Setting a rule on Cell Value Colour resolves per-cell (each cell's text colour follows the rule against its own data)
- [ ] Cell fill (gradient + zero/null) is unaffected by a Cell Value Colour rule
- [ ] Default (no rule, untouched picker) renders black text — pixel-identical to the pre-plan inherited default