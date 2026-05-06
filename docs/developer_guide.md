# Developer Guide – Codex Heatmap Matrix

## 1. Architecture
- File structure: `src/visual.ts`, `src/settings.ts`, `style/visual.less`, `capabilities.json`, `pbiviz.json`
- Rendering model: DOM rebuilt each update; container element persists, inner table regenerated from data.

## 2. Capabilities
- Data roles: rowCategory (Grouping), columnCategory (Grouping), cellValue (Measure), sortOrder (Measure)
- Format pane cards: heatmapSettings, columnSettings, labelSettings, axisSettings, titleSettings
- supportsHighlight, supportsKeyboardFocus, supportsLandingPage, supportsEmptyDataView, supportsMultiVisualSelection: all true.

## 3. APIs Used
- ISelectionManager — cross-filter + context menu
- ITooltipService — hover tooltips
- ILocalizationManager — string resources
- ISandboxExtendedColorPalette — high-contrast detection

## 4. Performance
- update() target: < 250ms
- No infinite loops or heavy timers
- DOM minimal — element refs limited to container; table rebuilt efficiently.

## 5. Accessibility
- ARIA labels on interactive elements (cells via role="gridcell" implied by table)
- High contrast support via colorPalette.isHighContrast
- Keyboard focus on tabbable elements (container receives focus)

## 6. Security
- No external calls
- No telemetry
- No external scripts or fonts
- No eval() or dynamic code

## 7. Build & Packaging
- powerbi-visuals-tools 7.x
- Node 20
- TypeScript 5.5+
- `npm install && pbiviz package`
- Output: `.pbiviz` < 2.5 MB