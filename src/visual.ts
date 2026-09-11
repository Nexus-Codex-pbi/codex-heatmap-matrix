"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import DataView = powerbi.DataView;

import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { ColorHelper } from "powerbi-visuals-utils-colorutils";

import { VisualFormattingSettingsModel, textAlignFor } from "./settings";
import { toRgba, compositeOver, contrastInk } from "./shared/colorHelpers";
import { Theme, accentToken } from "./shared/bandEngine";
import { heatmapRamp, ragScale, surfaceTokens, mix, TABULAR_NUMS } from "./shared/designTokens";
import { applyHighContrast, densityHatching } from "./shared/highContrast";
import { makeCornerBrackets, CardSignatureHandle } from "./shared/cardSignature";
import { applyCardSignature } from "./shared/cardSignatureSettings";
import { applyBorder } from "./shared/borderSettings";
import { LicenseGate } from "./shared/licensing";

/** Largest grid we will build DOM for (1180.2.4 Data Types, large data).
 * Each cell is a <td> carrying ~10 inline style writes plus listeners, so the
 * cost is linear in CELLS, not in source rows — a million rows over
 * Region x Month is a 100-cell grid and renders instantly. 5,000 cells is far
 * past the point a heatmap is legible (a 100x50 grid) while staying well
 * inside a frame budget; the 30,000 the reduction cap can deliver is not. */
const MAX_RENDERED_CELLS = 5000;

/** Neither axis renders more than this many bands regardless of the cell
 * budget — 200 row labels is already unreadable, and it stops one enormous
 * axis from consuming the whole allowance and collapsing the other to 1. */
const MAX_GRID_AXIS = 200;

/** Luminance-based theme pick (same 0.55 threshold convention as the
 * pbiKpiCard v3 pilot, Plan 15) — decides whether the resolved
 * background reads as a "dark" or "light" surface. */
function themeFor(hex: string): Theme {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex || "");
    if (!m) return "dark";
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? "light" : "dark";
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private host: IVisualHost;
    private eventService: IVisualEventService;
    private selectionManager: ISelectionManager;
    private localizationManager: ILocalizationManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private container: HTMLElement;
    private tooltipService: ITooltipService;

    // State for the Zero/Null Colour fx wiring (TRANS-04) — per-cell
    // object overrides live on the raw DataViewCategoryColumn.objects,
    // indexed the same way as the row/col arrays built in update().
    private zeroColorHelper: ColorHelper | null = null;

    // v3 corner-bracket card signature (LOOK-04) — created once since
    // update() rebuilds the container's table DOM from scratch every
    // render; its elements are re-appended (moved to the end) after each
    // rebuild so they keep painting above the title/table.
    private cornerSignature: CardSignatureHandle | null = null;

    private licenseGate: LicenseGate;

    private lastUpdateOptions: VisualUpdateOptions | null = null;


    constructor(options: VisualConstructorOptions) {

        // NO FREE TIER — an unlicensed user gets the whole visual blocked.

        // The check is async, so re-run the last update once it resolves.

        this.licenseGate = new LicenseGate(options.host, () => {

            if (this.lastUpdateOptions) this.update(this.lastUpdateOptions);

        });
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;
        this.eventService = options.host.eventService;
        this.selectionManager = this.host.createSelectionManager();
        this.localizationManager = this.host.createLocalizationManager();
        this.tooltipService = options.host.tooltipService;

        this.container = document.createElement("div");
        this.container.className = "heatmap-container";
        this.container.style.width = "100%";
        this.container.style.height = "100%";
        this.container.style.overflow = "auto";
        this.target.appendChild(this.container);

        // Context menu on container (content area) AND target (any gap between target and container)
        const ctxHandler = (event: MouseEvent) => {
            this.selectionManager.showContextMenu({} as ISelectionId, { x: event.clientX, y: event.clientY });
            event.preventDefault();
        };
        this.target.addEventListener("contextmenu", ctxHandler);
        this.container.addEventListener("contextmenu", ctxHandler);

        this.cornerSignature = makeCornerBrackets(this.container, "#8f8ab8", {
            variant: "cornerBracket",
            mirror: true,
        });
    }

    public update(options: VisualUpdateOptions): void {
        this.eventService.renderingStarted(options);
        this.lastUpdateOptions = options;

        if (this.licenseGate.blockedThisFrame()) {
            this.target.style.display = "none";
            this.eventService.renderingFinished(options);
            return;
        }
        this.target.style.display = "";

        try {
            const dataView: DataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel, dataView
            );

            // ─── Dedicated background layer (D-05) ─────────────────────
            // Suite-wide shared Background card (Colour + Transparency,
            // sourced from _shared/formatting/), painted on `this.container`
            // — the outer scrollable render root appended directly to
            // options.element — never on the existing per-cell colours
            // (heatmapSettings.lowColor/midColor/highColor/zeroColor,
            // rendered on each <td>). Applied unconditionally (before the
            // empty-state early return) so an empty-state render also
            // honours it. Its transparency default is overridden to 100 in
            // settings.ts specifically so an OLD saved report (this
            // property never previously existed) renders alpha 0 —
            // pixel-identical to "nothing painted" (D-06).
            // The raw, card-level format objects as the host delivered them.
            // The formatting model cannot distinguish "the author set this to
            // the same value as the default" from "the author never touched
            // it"; metadata.objects can, because an untouched property is
            // simply absent. Several NEXUS corrections turn on exactly that
            // distinction (§2, §4, §5), and applyBorder below already reads
            // the same object, so this is the existing idiom, named once.
            const metadataObjects = dataView?.metadata?.objects as any;

            const background = this.formattingSettings.background;
            const bgHex = background.backgroundColor.value?.value ?? "#ffffff";
            const bgTransparencyPct = background.transparency.value ?? 100;
            this.container.style.backgroundColor = toRgba(bgHex, bgTransparencyPct);

            // v3: theme pick + the single HC fallback rule (LOOK-04/05),
            // computed once and reused everywhere colour is resolved below.
            // --codex-accent drives the CSS-only cyan hover ring (visual.less).
            // Theme-source ladder: a painted Background governs; else the
            // report-theme palette background, so a dark report theme adapts
            // the matrix even with the (default) transparent container.
            const colorPalette = this.host.colorPalette as any;
            // The surface a CELL is actually painted on (NEXUS cycle-05 §1):
            // this visual's own Background card composited over whatever the
            // host reports as the page colour. This is the `behind` argument
            // for resolving a translucent cell fill to the colour a viewer
            // really sees — NOT bgHex, which at Cell Transparency 100 is
            // painting nothing at all.
            const cellBackdrop = compositeOver(bgHex, bgTransparencyPct, colorPalette?.background?.value ?? bgHex);
            // …and it is the SAME surface the theme must be picked from
            // (NEXUS cycle-05 §1, related limitation, this branch). The old
            // ladder took the RAW bgHex whenever the Background card was
            // painted at all, so black at 95% transparency — 5% ink over a
            // white page — selected the dark theme and rendered the muted
            // dark header token rgb(143, 138, 184) on what a viewer sees as
            // near-white. Compositing first is a strict generalisation of the
            // ladder it replaces, not a new behaviour: at transparency 100
            // compositeOver() returns the palette background exactly (the old
            // else-branch) and at 0 it returns bgHex exactly (the old
            // then-branch), so every saved report that never moved the slider
            // off an endpoint renders pixel-identically. Only a partially
            // transparent Background card can differ — and there the composite
            // is simply the truth.
            const theme: Theme = themeFor(cellBackdrop);
            const hc = applyHighContrast(colorPalette, { fallbackColor: surfaceTokens(theme).text, fallbackBackground: bgHex });
            const accentHex = accentToken(theme);
            this.container.style.setProperty("--codex-accent", hc.active ? hc.color : accentHex);
            this.container.classList.toggle("hc-mode", hc.active);

            // Visual's own Border card — CSS border on the scroll container so
            // it wraps the whole matrix; Corner Radius rounds the card. Applied
            // before the empty-state return so an empty render is bordered too.
            // Overflow left as-is (the container may scroll a large matrix).
            this.container.style.boxSizing = "border-box";
            applyBorder(this.container, this.formattingSettings.visualBorder, {
                hcActive: hc.active,
                hcColor: hc.color,
                palette: colorPalette,
                metadataObjects: options.dataViews?.[0]?.metadata?.objects,
            });

            // Clear
            while (this.container.firstChild) {
                this.container.removeChild(this.container.firstChild);
            }

            if (!dataView || !dataView.categorical || !dataView.categorical.categories
                || dataView.categorical.categories.length < 2
                || !dataView.categorical.values || dataView.categorical.values.length < 1) {
                const msg = document.createElement("div");
                msg.className = "heatmap-empty";
                msg.textContent = this.localizationManager.getDisplayName("Visual_Landing_Message");
                this.container.appendChild(msg);
                this.cornerSignature?.elements.forEach((el) => this.container.appendChild(el));
                applyCardSignature(this.cornerSignature, this.formattingSettings?.cardSignature, { autoHex: "#8f8ab8", muted: true });
                this.eventService.renderingFinished(options);
                return;
            }

            // Render internal title (inside iframe, so contextmenu works here)
            const titleSettings = this.formattingSettings.titleSettings;
            if (titleSettings?.showTitle?.value && titleSettings?.titleText?.value) {
                const titleEl = document.createElement("div");
                titleEl.className = "heatmap-title";
                titleEl.textContent = titleSettings.titleText.value;
                if (titleSettings.titleFontFamily?.value) {
                    titleEl.style.fontFamily = titleSettings.titleFontFamily.value;
                }
                if (titleSettings.titleFontSize?.value) {
                    titleEl.style.fontSize = `${titleSettings.titleFontSize.value}px`;
                }
                titleEl.style.fontWeight = titleSettings.titleBold?.value ? "700" : "400";
                titleEl.style.fontStyle = titleSettings.titleItalic?.value ? "italic" : "normal";
                titleEl.style.textDecoration = titleSettings.titleUnderline?.value ? "underline" : "none";
                titleEl.style.textAlign = textAlignFor(titleSettings.titleAlign?.value as string);
                if (titleSettings.titleColor?.value?.value) {
                    // Adaptive default (D-16 sentinel): untouched shared-Title navy
                    // swaps to the dark text token on dark surfaces.
                    const setTitle = titleSettings.titleColor.value.value;
                    // HC wins (system foreground); else adaptive navy→dark-token
                    // on dark surfaces (previously the title had NO HC branch —
                    // Neil-flagged gap, it stayed navy under high contrast).
                    titleEl.style.color = hc.active
                        ? hc.color
                        : (setTitle === "#1a1a2e" && theme === "dark"
                            ? surfaceTokens("dark").text : setTitle);
                }
                titleEl.style.padding = "8px 12px 4px";
                this.container.appendChild(titleEl);
            }

            const categorical = dataView.categorical;
            const categories = categorical.categories;
            // Value columns are resolved BY ROLE, not by position (NEXUS
            // cycle-05 §3). capabilities.json binds TWO measures to the
            // values well — Cell Value and the optional Sort Order — and
            // taking values[0] both assumed a delivery order and left the
            // second column unread, which is why the advertised row sort
            // never happened. The positional fallback is kept so a host
            // that reports no roles renders exactly as it does today.
            const valueColumns = categorical.values;
            const values = Array.prototype.find.call(
                valueColumns, (column: powerbi.DataViewValueColumn) => column?.source?.roles?.["cellValue"]
            ) as powerbi.DataViewValueColumn ?? valueColumns[0];
            const sortColumn = Array.prototype.find.call(
                valueColumns, (column: powerbi.DataViewValueColumn) => column?.source?.roles?.["sortOrder"]
            ) as powerbi.DataViewValueColumn ?? null;

            let rowCatIndex = -1;
            let colCatIndex = -1;
            for (let i = 0; i < categories.length; i++) {
                const roles = categories[i].source.roles;
                if (roles && roles["rowCategory"]) rowCatIndex = i;
                if (roles && roles["columnCategory"]) colCatIndex = i;
            }

            if (rowCatIndex < 0 || colCatIndex < 0) {
                const msg = document.createElement("div");
                msg.className = "heatmap-empty";
                msg.textContent = this.localizationManager.getDisplayName("Visual_Landing_Message");
                this.container.appendChild(msg);
                this.cornerSignature?.elements.forEach((el) => this.container.appendChild(el));
                applyCardSignature(this.cornerSignature, this.formattingSettings?.cardSignature, { autoHex: "#8f8ab8", muted: true });
                this.eventService.renderingFinished(options);
                return;
            }

            const rowCat = categories[rowCatIndex];
            const colCat = categories[colCatIndex];

            const dataMap = new Map<string, Map<string, number>>();
            // 1180.2.4 Data Types — the Cell Value well accepts a TEXT column, not
            // just a measure, and the value then arrives as a string. Without this
            // map `Number("North")` is NaN and the cell renders blank, which is the
            // exact repro Microsoft raised in the April 2026 review. The fix shipped
            // in a5a4d1c and was silently deleted five days later by 02e5aa3
            // ("stripped visual.ts back to bare minimum"); it was re-flagged on the
            // 2026-08-03 review. Do not remove without replacing the behaviour.
            const stringDataMap = new Map<string, Map<string, string>>();
            // 1180.2.4 Data Types (large data) — nested row->col->index rather than a
            // flat map keyed on `${row}|${col}`. The flat form allocated one throwaway
            // key string PER SOURCE ROW; at 1M rows that dominated the parse. Nested
            // Maps key on strings we already hold.
            const cellIndexMap = new Map<string, Map<string, number>>();
            const uniqueRows: string[] = [];
            const uniqueCols: string[] = [];
            const colSet = new Set<string>();
            // Sort Order rank per ROW KEY (NEXUS cycle-05 §3) — keyed on the
            // row category the rank arrived with, never on a position, so the
            // ordering survives every later lookup unchanged.
            const rowRanks = new Map<string, number>();

            let dataMin = Infinity;
            let dataMax = -Infinity;
            let rawMax = -Infinity;

            // Hoisted out of the loop condition — `.values` is a property access on
            // the host's dataView object and this loop runs once per source row.
            const rowValues = rowCat.values;
            const colValues = colCat.values;
            const cellValues = values.values;
            const sortValues = sortColumn ? sortColumn.values : null;
            const rowCount = rowValues.length;

            for (let i = 0; i < rowCount; i++) {
                const rv = rowValues[i];
                const cv = colValues[i];
                // Skip String() when the value is already a string — the common case
                // for category columns, and String() on a string still costs a call.
                const rowKey = rv === null || rv === undefined ? "" : (typeof rv === "string" ? rv : String(rv));
                const colKey = cv === null || cv === undefined ? "" : (typeof cv === "string" ? cv : String(cv));
                const rawVal = cellValues[i];
                // 1180.2.4 — BLANK is not zero. Number(null) and Number("") both
                // coerce to 0, so a null cell used to paint as a measured zero and
                // print "0" — the visual asserting "this department did nothing"
                // when the truth is "no data". Blanks are forced to NaN so they take
                // the empty branch and show nothing; a real 0 still prints 0.
                const isBlank = rawVal === null || rawVal === undefined
                    || (typeof rawVal === "string" && rawVal.trim() === "");
                // A string that isn't numeric-parseable is a text cell, not a broken
                // number. Also NaN so it stays out of the dataMin/dataMax ramp domain
                // and renders via the text branch below.
                const isStringVal = !isBlank && typeof rawVal === "string" && isNaN(Number(rawVal));
                const numVal = (isBlank || isStringVal)
                    ? NaN
                    : (typeof rawVal === "number" ? rawVal : Number(rawVal));

                // Single lookup per map instead of has()+get()+set() — three hashes
                // become one on the hot path.
                let rowCells = dataMap.get(rowKey);
                if (rowCells === undefined) {
                    rowCells = new Map<string, number>();
                    dataMap.set(rowKey, rowCells);
                    uniqueRows.push(rowKey);   // insertion order == first-seen order
                }
                rowCells.set(colKey, numVal);

                if (!colSet.has(colKey)) { colSet.add(colKey); uniqueCols.push(colKey); }

                // First FINITE rank wins for a row key. A BLANK rank is not
                // recorded at all rather than coerced — Number(null) is 0,
                // which would silently promote an unranked row to the front
                // of the grid and assert an order the model never supplied.
                if (sortValues && !rowRanks.has(rowKey)) {
                    const rawRank = sortValues[i];
                    const rank = rawRank === null || rawRank === undefined ? NaN : Number(rawRank);
                    if (Number.isFinite(rank)) rowRanks.set(rowKey, rank);
                }

                if (isStringVal) {
                    let strCells = stringDataMap.get(rowKey);
                    if (strCells === undefined) {
                        strCells = new Map<string, string>();
                        stringDataMap.set(rowKey, strCells);
                    }
                    strCells.set(colKey, rawVal as string);
                }

                let idxCells = cellIndexMap.get(rowKey);
                if (idxCells === undefined) {
                    idxCells = new Map<string, number>();
                    cellIndexMap.set(rowKey, idxCells);
                }
                if (!idxCells.has(colKey)) idxCells.set(colKey, i);

                // Number.isFinite skips the coercion the global isFinite performs.
                if (Number.isFinite(numVal) && numVal !== 0) {
                    if (numVal < dataMin) dataMin = numVal;
                    if (numVal > dataMax) dataMax = numVal;
                }
                // The REAL maximum, kept separately from the colour domain
                // (NEXUS cycle-05 §6). Zeros count here even though they are
                // deliberately off the colour ramp above, so an all-zero grid
                // still has a defined peak.
                if (Number.isFinite(numVal) && numVal > rawMax) rawMax = numVal;
            }

            if (!isFinite(dataMin)) dataMin = 0;
            if (!isFinite(dataMax)) dataMax = 0;
            if (dataMin === dataMax) { dataMin -= 1; dataMax += 1; }

            // ─── Peak value (NEXUS cycle-05 §6) ──────────────────────────
            // Highlight Peak used to compare each cell against dataMax — the
            // COLOUR DOMAIN's maximum, not the data's. Those are the same
            // number only when the data has at least two distinct nonzero
            // values: with one value, or with every value equal, the ±1
            // expansion two lines up moves dataMax off every real cell, so
            // nothing was ever outlined; and zeros never reach the numeric
            // branch at all, so an all-zero grid had no peak either.
            //
            // peakValue is the real maximum over every finite numeric cell,
            // zeros included, and null when there is no numeric cell at all.
            // That is the explicit zero-only definition the correction asks
            // for: when every value is zero, zero IS the maximum and the zero
            // cells carry the outline. High contrast still owns the border
            // channel and suppresses the outline, which §6 states is intended.
            const peakValue: number | null = isFinite(rawMax) ? rawMax : null;

            // ─── Row ordering by the Sort Order role (NEXUS cycle-05 §3) ────
            // capabilities.json has advertised Sort Order as an "Optional
            // numeric value to control row sort order (ascending)" for as long
            // as the role has existed, but the renderer only ever read the
            // FIRST value column, so rows always came out in first-seen order
            // — A/B/C stayed A/B/C whether the author ranked them 2/1/3 or
            // 2/3/1. The only sorting that ran was the weekday COLUMN sort.
            //
            // Sorted here on the row KEY the rank was collected against, so
            // every per-cell fill, fx override, selectionId, tooltip and peak
            // outline below still resolves through the identity-keyed maps
            // (dataMap / stringDataMap / cellIndexMap / rowCat.objects[cellIdx]).
            // Nothing downstream keys off a row's position, so moving a row
            // carries its colour and its conditional formatting with it.
            //
            // Stable, and gaps stay gaps: ranked rows lead in ascending rank,
            // ties keep first-seen order (Array#sort is stable per ES2019), and
            // rows the measure left blank keep first-seen order BEHIND the
            // ranked rows instead of being coerced to rank 0. With the role
            // unbound rowRanks is empty and the array is left untouched, so an
            // existing saved report that never bound Sort Order is unchanged.
            //
            // Runs BEFORE the grid cap below so that when a huge grid is
            // truncated the rows kept are the author's first N, not the
            // model's first N.
            if (rowRanks.size > 0) {
                uniqueRows.sort((a, b) => {
                    const rankA = rowRanks.get(a);
                    const rankB = rowRanks.get(b);
                    if (rankA === undefined) return rankB === undefined ? 0 : 1;
                    if (rankB === undefined) return -1;
                    return rankA - rankB;
                });
            }

            // 1180.2.4 Data Types (large data) — BOUND THE RENDERED GRID.
            //
            // Row count is not the hazard: a million rows over Region x Month is a
            // small grid. CELL count is, and cells are uniqueRows x uniqueCols, so a
            // high-cardinality field on either axis (the cert reviewer bound a numeric
            // column to Column Category) explodes it. At the declared 30,000-row
            // reduction cap that is up to 30,000 <td> nodes, each with ~10 inline
            // style writes, built synchronously — which locks the iframe and takes
            // Power BI Desktop with it. That is the "stops responding" report.
            //
            // The policy's own remedy is "paginate, cap, or use virtualization". We
            // cap, and we SAY SO on the canvas — a silently truncated heatmap is a
            // lying heatmap. No legible grid approaches this size anyway.
            const fullRowCount = uniqueRows.length;
            const fullColCount = uniqueCols.length;
            let gridTruncated = false;

            if (fullRowCount * fullColCount > MAX_RENDERED_CELLS) {
                let keepRows = Math.min(fullRowCount, MAX_GRID_AXIS);
                let keepCols = Math.min(fullColCount, MAX_GRID_AXIS);
                if (keepRows * keepCols > MAX_RENDERED_CELLS) {
                    // Shrink both axes proportionally so the grid keeps its shape
                    // rather than collapsing to a strip.
                    const scale = Math.sqrt(MAX_RENDERED_CELLS / (keepRows * keepCols));
                    keepRows = Math.max(1, Math.floor(keepRows * scale));
                    keepCols = Math.max(1, Math.floor(keepCols * scale));
                }
                if (keepRows < fullRowCount || keepCols < fullColCount) {
                    uniqueRows.length = keepRows;
                    uniqueCols.length = keepCols;
                    gridTruncated = true;
                }
            }

            // Pull format settings
            const heat = this.formattingSettings.heatmapSettings;
            const lbl = this.formattingSettings.labelSettings;
            const ax = this.formattingSettings.axisSettings;
            const colSettings = this.formattingSettings.columnSettings;

            // Column ordering
            const orderMode = (colSettings?.columnOrder?.value as { value?: string })?.value || "auto";
            if (orderMode === "weekday") {
                const weekdayRank: Record<string, number> = {
                    SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
                    SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6
                };
                uniqueCols.sort((a, b) => {
                    const ra = weekdayRank[a.toUpperCase()] ?? 99;
                    const rb = weekdayRank[b.toUpperCase()] ?? 99;
                    return ra - rb;
                });
            }

            // Color scheme
            const schemeVal = (heat?.colorScheme?.value as { value?: string })?.value || "greenToRed";
            const lowC = heat?.lowColor?.value?.value || "#e0f5ef";
            // Read by the three-stop Custom ramp below, but ONLY when the
            // author has actually set it (NEXUS cycle-05 §4) — an untouched
            // Mid Colour keeps the v3 two-stop heatmapRamp() formula so old
            // saved reports are byte-identical.
            const midC = heat?.midColor?.value?.value || "#fef3d6";
            const highC = heat?.highColor?.value?.value || "#fde8ea";
            const zeroC = heat?.zeroColor?.value?.value || "#f0eee6";

            const cellRadius = heat?.cellBorderRadius?.value ?? 4;
            const showVals = heat?.showValues?.value !== false;
            const valueFormat = (heat?.valueFormat?.value as { value?: string })?.value || "number";
            const decimals = heat?.decimalPlaces?.value ?? 0;

            const cellFontSize = lbl?.fontSize?.value ?? 12;
            const headerFontSize = lbl?.headerFontSize?.value ?? 11;
            // Header/row-label colour — D-16 adaptive: the untouched grey
            // default swaps to the muted light token on dark surfaces (headers
            // were NOT adapting to the background shift — Neil 2026-07-14);
            // HC system foreground wins; a user-set colour is honoured as-is.
            const HEADER_DEFAULT = "#333333";
            const rawHeaderColor = lbl?.fontColor?.value?.value || HEADER_DEFAULT;
            const headerColor = hc.active ? hc.color
                : (rawHeaderColor === HEADER_DEFAULT && theme === "dark"
                    ? surfaceTokens("dark").muted : rawHeaderColor);

            // Per-surface text treatment (TEXT-01) — cell value label font
            // + header font, siblings to the fontSize/headerFontSize reads
            // above. weightFor(bold, restWeight) idiom (matches
            // pbiVarianceWaterfall/pbiBulletChart precedent): bold on
            // renders "700" regardless of surface; bold off falls back to
            // each surface's own pre-existing hardcoded weight so old saved
            // reports render pixel-identical (D-06).
            const weightFor = (bold: boolean | undefined, restWeight: string): string => bold ? "700" : restWeight;
            const cellFontFamily = lbl?.fontFamily?.value || "Segoe UI, sans-serif";
            const cellWeight = weightFor(lbl?.bold?.value, "500");
            const cellFontStyle = lbl?.italic?.value ? "italic" : "normal";
            const cellTextDecoration = lbl?.underline?.value ? "underline" : "none";
            // Cell Value Colour. CELL_LABEL_DEFAULT is the value settings.ts
            // ships (settings.ts:231) and is the sentinel for "the author has
            // never touched this swatch" — the same idiom HEADER_DEFAULT uses
            // a few lines above for the header colour. An author who sets the
            // swatch (to anything, black included) is honoured verbatim; only
            // the untouched default is treated as "automatic" and resolved
            // against the surface (NEXUS cycle-05 §1/§2).
            const CELL_LABEL_DEFAULT = "#000000";
            const cellLabelColorDefault = lbl?.cellLabelColor?.value?.value || CELL_LABEL_DEFAULT;
            const cellLabelColorIsAuto = cellLabelColorDefault.toLowerCase() === CELL_LABEL_DEFAULT;

            const headerFontFamily = lbl?.headerFontFamily?.value || "Segoe UI, sans-serif";
            // Header Bold (NEXUS cycle-05 §5). The weightFor idiom's "bold off
            // falls back to the surface's pre-existing weight" rule is a no-op
            // on these two surfaces, because their pre-existing weights are
            // ALREADY bold: .heatmap-col-header is 700 and .heatmap-row-label
            // is 600, so switching the toggle off changed column headers not at
            // all and row labels only from 700 to semibold. The toggle also
            // defaults ON, so those legacy weights are what every saved report
            // is already showing.
            //
            // Correction line: "distinguish a legacy untouched default from an
            // explicit off setting, so switching off can actually remove bold
            // without silently changing old reports." So: absent from
            // metadata.objects (never touched) keeps the legacy fallbacks
            // exactly; explicitly false means regular 400 on both surfaces;
            // explicitly true is 700 as before.
            const headerBoldSet = metadataObjects?.labelSettings?.headerBold !== undefined;
            const headerWeightFor = (legacyWeight: string): string =>
                headerBoldSet
                    ? (lbl?.headerBold?.value ? "700" : "400")
                    : weightFor(lbl?.headerBold?.value, legacyWeight);
            const colHeaderWeight = headerWeightFor("700");
            const rowLabelWeight = headerWeightFor("600");
            const headerFontStyle = lbl?.headerItalic?.value ? "italic" : "normal";
            const headerTextDecoration = lbl?.headerUnderline?.value ? "underline" : "none";

            const formatVal = (n: number): string => {
                if (valueFormat === "percent") {
                    return `${(n * 100).toFixed(decimals)}%`;
                }
                return n.toLocaleString(undefined, {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals
                });
            };

            // Cell region transparency (D-05 per-region slider, sibling to
            // the existing colour pickers above) — applied to whichever
            // hex colour colorFor()/zeroC resolves to at render, via the
            // frozen toRgba() wrapper. Cells are ALWAYS painted a colour
            // today (never "unpainted"), so 0 (opaque) is the correct
            // no-override default (D-06).
            const cellTransparencyPct = heat?.cellTransparency?.value ?? 0;

            // Peak highlight — outline the highest-valued cell(s). Opt-in, so an
            // existing saved report is untouched until the author enables it.
            // High-contrast mode owns the whole border channel (it encodes the
            // cell edge itself), so the peak outline is suppressed under HC
            // rather than fighting it.
            const highlightPeak = heat?.highlightPeak?.value === true;
            const peakBorderColor = heat?.peakBorderColor?.value?.value ?? "#FFFFFF";
            const peakBorderWidth = heat?.peakBorderWidth?.value ?? 2;

            // ─── v3 single-hue perceptual ramp (LOOK-04) ─────────────────
            // colorFor()/inkFor() now route through the frozen v3 engine's
            // heatmapRamp()/ragScale() FORMULAS (cell = mix(surface, accent,
            // t)) instead of the old hardcoded 2/3-stop lerp lists, so an fx
            // colour override recomputes cleanly (D-16). "greenToRed"/
            // "redToGreen" keep their literal diverging RAG semantics via
            // ragScale (the ONE sanctioned non-single-hue exception, §2).
            // "sequential"/"custom" are re-mapped onto the single-hue
            // formula: "sequential" already meant a one-hue ramp in
            // colour-theory terms (was previously a hardcoded blue lerp,
            // now void-canvas -> theme accent, matching the v2 default);
            // "custom" keeps resolving the EXISTING Low/High Colour pickers
            // as the ramp's surface/accent inputs — midColor is superseded
            // by the 2-stop formula and no longer read (documented, bounded
            // deviation; the property remains in the format pane, D-16/D-06).
            const isRag = schemeVal === "greenToRed" || schemeVal === "redToGreen";
            const surf = surfaceTokens(theme);
            const rampFor = (t: number): { cell: string; inkFlip: boolean } =>
                schemeVal === "custom"
                    ? heatmapRamp(t, 0, 1, lowC, highC, theme)
                    : heatmapRamp(t, 0, 1, surf.canvas, accentHex, theme);

            // ─── Custom Mid Colour is no longer a no-op (NEXUS cycle-05 §4) ──
            // The v3 rewrite replaced Custom's three-stop lerp with the
            // two-stop heatmapRamp() formula and left the Mid Colour picker in
            // the pane, where it reported its value and could not change a
            // single pixel. §4's correction offers two ways out; the second
            // ("restore a functional midpoint") is taken, narrowed by its own
            // final clause ("preserve saved metadata compatibility") to the
            // case where the author ACTUALLY SET the control — i.e. midColor
            // is present in metadata.objects. A saved report that never
            // touched Mid Colour keeps the two-stop ramp byte-for-byte; a
            // report that did set it finally gets what it asked for.
            const midExplicit = metadataObjects?.heatmapSettings?.midColor !== undefined;
            const useCustomMid = schemeVal === "custom" && midExplicit;
            const colorFor = (t: number): string => {
                if (isRag) return ragScale(schemeVal === "redToGreen" ? 1 - t : t, theme);
                if (useCustomMid) {
                    const u = Math.max(0, Math.min(1, t));
                    return u <= 0.5 ? mix(lowC, midC, u * 2) : mix(midC, highC, (u - 0.5) * 2);
                }
                return rampFor(t).cell;
            };

            // ─── Adaptive ink from the COMPOSITED cell (NEXUS cycle-05 §1) ───
            // The two candidate inks per theme, named once. These are exactly
            // the colours the old branch could return, so nothing below can
            // introduce a colour this visual did not already paint (D-06).
            const darkInk = theme === "dark" ? surf.canvas : surf.text;
            const lightInk = theme === "dark" ? surf.text : surfaceTokens("light").card;

            // heatmapRamp()'s `inkFlip` is a function of the NORMALISED VALUE,
            // not of the colour that ends up on screen, and the flat per-theme
            // constant the RAG schemes used is not a function of the cell at
            // all. NEXUS reproduced three ways that reaches 1:1 contrast:
            //
            //   (a) Cell Transparency is applied AFTER the ink is chosen. At
            //       100 the cell paints NOTHING, so the label lands on the
            //       page while its ink was picked for a fill nobody sees —
            //       cyan `30` rendered rgb(7,7,26) on a rgb(7,7,26) page.
            //   (b) Under Custom the AUTHOR supplies both endpoints, so the
            //       ramp's assumed brightness direction can be inverted —
            //       Low=black/High=white made the maximum cell white on white.
            //   (c) Even opaque, on-token cells: t=0.495 trips inkFlip while
            //       the fill still reads light, so `49` rendered white on
            //       rgb(110, 181, 202) at 2.301:1.
            //
            // All three are the same mistake — judging ink by a proxy for the
            // surface instead of by the surface. Ink is now chosen by MEASURED
            // CONTRAST against the colour actually seen: the resolved fill
            // composited at Cell Transparency over the backdrop the cell sits
            // on, then contrastInk() picks whichever of the two candidates has
            // the higher WCAG ratio on it.
            //
            // A tone BUCKET cannot do this job here. surfaceTone()'s Rec.601
            // brightness reads saturated cyan rgb(1, 191, 227) as 0.542 —
            // "dark" — and puts near-white ink on it at 1.798:1, where black
            // scores 9.07:1; routing the opaque Sequential dark preset through
            // the bucket made 12 of 35 cells worse. Measured over all 184
            // recorded cells of eight fixtures, the bucket left 11 cells under
            // 3:1 and contrastInk() left none. Evidence:
            // reproducers/pbi-cycle-05-heatmap-matrix-2026-09-11/probe-MINE-1.py.
            // surfaceTone() stays the right tool for neutral card/background
            // surfaces; a data-driven ramp fill is not one.
            //
            // The candidates are still only the two tokens the old branch
            // could return, so no new colour enters the visual. Explicit
            // overrides still win: the per-cell fx swatch/rule is resolved by
            // the ColorHelper below with this only as its fallback, and high
            // contrast never reaches here at all (it owns its own branch, and
            // the zero/blank/text branch keeps its own Cell Value Colour).
            const inkFor = (t: number): string =>
                contrastInk(compositeOver(colorFor(t), cellTransparencyPct, cellBackdrop), darkInk, lightInk);

            // ─── …and the same rule for the OTHER fill (NEXUS cycle-05 §1) ───
            // A zero, blank or text cell is not on the ramp — it is painted
            // with Zero/Null Colour — but it is painted, and its label was
            // taking Cell Value Colour's untouched #000000 default whatever it
            // landed on. NEXUS measured that at Cell Transparency 100 over a
            // #07071a page: black on the page itself, 1.05:1. The harness also
            // records it at 1.3:1 on a plain author-set Zero Colour of
            // #112233 with no transparency involved at all, so this is not a
            // transparency edge case — it is the same "ink judged by a proxy
            // for the surface" mistake as the ramp branch, in the one place
            // the round-1 fix deliberately did not reach.
            //
            // So: the SAME chooser, on the resolved zero fill, composited at
            // Cell Transparency over the same backdrop. Candidates are still
            // only darkInk/lightInk, so no new colour enters the visual.
            //
            // Scope is deliberately narrow, per §2's correction ("distinguish
            // an untouched automatic default from an explicit static swatch
            // and honour the latter"): this applies ONLY while the swatch is
            // still at its shipped default. An author-set card-level colour is
            // returned verbatim, a per-cell fx rule/instance object still wins
            // over both (it is resolved by the ColorHelper, this is only its
            // fallback), and high contrast never reaches here.
            const zeroInkFor = (fillHex: string): string =>
                cellLabelColorIsAuto
                    ? contrastInk(compositeOver(fillHex, cellTransparencyPct, cellBackdrop), darkInk, lightInk)
                    : cellLabelColorDefault;

            // Layout: optional yAxisTitle (left) + table; xAxisTitle below
            const showAxes = ax?.showAxisTitles?.value === true;
            const xAxisTitleText = ax?.xAxisTitle?.value || "";
            const yAxisTitleText = ax?.yAxisTitle?.value || "";

            const layoutWrap = document.createElement("div");
            layoutWrap.style.display = "flex";
            layoutWrap.style.flexDirection = "row";
            layoutWrap.style.alignItems = "stretch";
            layoutWrap.style.width = "100%";
            // Horizontal breathing room so the last column doesn't hug the
            // right edge / border (Neil 2026-07-14). Padding lives on this
            // INNER wrapper, NEVER the root container — root padding creates a
            // right-click dead zone that fails cert Policy 1180.2.5 (this
            // visual was pinged on it repeatedly; see feedback_pbi_padding_
            // deadzone). box-sizing keeps the width:100% table inside the box.
            layoutWrap.style.boxSizing = "border-box";
            layoutWrap.style.padding = "0 14px";

            if (showAxes && yAxisTitleText) {
                const yAx = document.createElement("div");
                yAx.style.writingMode = "vertical-rl";
                yAx.style.transform = "rotate(180deg)";
                yAx.style.padding = "0 6px";
                yAx.style.fontSize = `${headerFontSize}px`;
                yAx.style.fontWeight = "600";
                yAx.style.color = headerColor;
                yAx.style.display = "flex";
                yAx.style.alignItems = "center";
                yAx.style.justifyContent = "center";
                yAx.textContent = yAxisTitleText;
                layoutWrap.appendChild(yAx);
            }

            // ─── Conditional formatting (fx) wiring — Zero/Null Colour (TRANS-04) ──
            // heat.zeroColor already carried a bare `instanceKind:
            // ConstantOrRule` declaration, but with no
            // `selector`/`altConstantSelector` wired it was inert (Pitfall
            // 5). Wired here: a dataViewWildcard selector (so a rule can
            // match this property's instances/totals) + an
            // altConstantSelector bound to the first cell's selectionId
            // (the "set for all" swatch edit path), resolved per-cell at
            // render via ColorHelper.getColorForMeasure against
            // rowCat.objects[cellIdx] — same per-instance pattern already
            // proven on pbiProgressBarCard's Fixed Colour / pbiTimeBreakdown's
            // Total Colour, applied here to a categorical grid's per-cell
            // "value colour" (the zero/null-cell fill) rather than a
            // continuous gradient (the low/mid/high scheme anchors are
            // interpolation endpoints, not per-datapoint fills, so they are
            // out of scope for fx per D-09 — structural chrome).
            const firstCellIdx = rowCat.values.length > 0 ? 0 : undefined;
            let firstCellSelId: ISelectionId | null = null;
            if (firstCellIdx !== undefined) {
                try {
                    firstCellSelId = this.host.createSelectionIdBuilder()
                        .withCategory(rowCat, firstCellIdx)
                        .withCategory(colCat, firstCellIdx)
                        .createSelectionId();
                } catch { firstCellSelId = null; }
            }
            heat.zeroColor.selector = dataViewWildcard.createDataViewWildcardSelector(
                dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
            );
            heat.zeroColor.altConstantSelector = undefined; // card-level constant persistence: swatch edits apply to ALL instances + round-trip into the pane (first-instance binding persisted a row-0-only override); fx rules stay per-instance via the wildcard selector;
            this.zeroColorHelper = new ColorHelper(
                this.host.colorPalette,
                { objectName: "heatmapSettings", propertyName: "zeroColor" },
                zeroC
            );

            // ─── fx wiring — Cell Value Colour (TEXT-02) ────────────────
            // Same per-cell resolution pattern as Zero/Null Colour above,
            // applied to the cell LABEL text colour (the numeric value
            // drawn ON the cell) — distinct from the cell FILL gradient,
            // which stays exactly as Plan 07 left it. Resolved per-cell at
            // render via ColorHelper.getColorForMeasure against
            // rowCat.objects[cellIdx].
            lbl.cellLabelColor.selector = dataViewWildcard.createDataViewWildcardSelector(
                dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
            );
            lbl.cellLabelColor.altConstantSelector = undefined; // card-level constant persistence: swatch edits apply to ALL instances + round-trip into the pane (first-instance binding persisted a row-0-only override); fx rules stay per-instance via the wildcard selector;
            // No shared ColorHelper for this property any more: every branch
            // that resolves it now needs a per-cell fallback (inkFor(t) on the
            // ramp, zeroInkFor(resolvedZeroColor) on the zero/blank/text fill),
            // so the helper is constructed at the cell. The selector wiring
            // above is what drives the fx button and stays exactly as it was.

            const table = document.createElement("table");
            table.className = "heatmap-table";

            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");
            const cornerCell = document.createElement("th");
            cornerCell.className = "heatmap-corner";
            headerRow.appendChild(cornerCell);
            for (const col of uniqueCols) {
                const th = document.createElement("th");
                th.className = "heatmap-col-header";
                th.textContent = col;
                th.style.fontSize = `${headerFontSize}px`;
                th.style.color = headerColor;
                th.style.fontFamily = headerFontFamily;
                th.style.fontWeight = colHeaderWeight;
                th.style.fontStyle = headerFontStyle;
                th.style.textDecoration = headerTextDecoration;
                headerRow.appendChild(th);
            }
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement("tbody");
            for (const row of uniqueRows) {
                const tr = document.createElement("tr");
                const rowLabel = document.createElement("td");
                rowLabel.className = "heatmap-row-label";
                rowLabel.textContent = row;
                rowLabel.style.fontSize = `${headerFontSize}px`;
                rowLabel.style.color = headerColor;
                rowLabel.style.fontFamily = headerFontFamily;
                rowLabel.style.fontWeight = rowLabelWeight;
                rowLabel.style.fontStyle = headerFontStyle;
                rowLabel.style.textDecoration = headerTextDecoration;
                tr.appendChild(rowLabel);

                const rowMap = dataMap.get(row);
                const strRowMap = stringDataMap.get(row);
                const idxRowMap = cellIndexMap.get(row);
                for (const col of uniqueCols) {
                    const td = document.createElement("td");
                    td.className = "heatmap-cell";
                    td.style.borderRadius = `${cellRadius}px`;
                    td.style.fontSize = `${cellFontSize}px`;
                    td.style.fontFamily = cellFontFamily;
                    td.style.fontWeight = cellWeight;
                    td.style.fontStyle = cellFontStyle;
                    td.style.textDecoration = cellTextDecoration;
                    td.style.fontFeatureSettings = TABULAR_NUMS;
                    const val = rowMap ? rowMap.get(col) : undefined;
                    const strVal = strRowMap ? strRowMap.get(col) : undefined;
                    let displayStr = "";

                    // Build selectionId for this cell (1180.2.2.3 Filter Out)
                    // — moved ahead of the colour branch below so the same
                    // cellIdx can resolve the Zero/Null Colour fx rule
                    // against this cell's own per-instance object overrides.
                    const cellIdx = idxRowMap ? idxRowMap.get(col) : undefined;
                    let cellSelId: ISelectionId | null = null;
                    if (cellIdx !== undefined) {
                        try {
                            cellSelId = this.host.createSelectionIdBuilder()
                                .withCategory(rowCat, cellIdx)
                                .withCategory(colCat, cellIdx)
                                .createSelectionId();
                        } catch { cellSelId = null; }
                    }

                    // Cell Value Colour (TEXT-02) — per-cell fx resolution
                    // against this cell's own per-instance object overrides
                    // (mirrors the Zero/Null Colour resolution below).
                    // Applies to the LABEL text only; the cell FILL
                    // (gradient / zeroColor) is untouched. v3 (LOOK-04): the
                    // STATIC fallback default is superseded by the per-cell
                    // ink-flip formula below — an explicit fx rule or
                    // format-pane swatch override still wins (the helper is
                    // constructed per-cell so its own fallback default can
                    // vary with t), D-16.
                    const cellInstanceObjects = cellIdx !== undefined ? rowCat.objects?.[cellIdx] : undefined;

                    if (strVal !== undefined) {
                        // 1180.2.4 Data Types — text cell. A string has no position
                        // on the colour ramp, so it takes the same fill as a
                        // zero/null cell (that fill already means "no numeric
                        // value"). Routed through zeroColorHelper /
                        // zeroInkFor / toRgba rather than the hardcoded
                        // #f5f4f0 the 2026-04 version used, so theming, cell
                        // transparency and the per-cell fx overrides all still apply.
                        if (hc.active) {
                            td.style.backgroundColor = hc.background;
                            td.style.backgroundImage = "none";
                            td.style.border = `${hc.borderWidth}px solid ${hc.color}`;
                            td.style.color = hc.color;
                        } else {
                            const resolvedZeroColor = this.zeroColorHelper?.getColorForMeasure(cellInstanceObjects, "zeroColor") ?? zeroC;
                            td.style.backgroundColor = toRgba(resolvedZeroColor, cellTransparencyPct);
                            td.style.backgroundImage = "none";
                            td.style.border = "none";
                            // Same per-cell ColorHelper shape as the ramp branch
                            // below/above: an explicit fx rule or per-instance
                            // object wins, and zeroInkFor() is only the fallback.
                            const zeroInkHelper = new ColorHelper(
                                this.host.colorPalette,
                                { objectName: "labelSettings", propertyName: "cellLabelColor" },
                                zeroInkFor(resolvedZeroColor)
                            );
                            td.style.color = zeroInkHelper.getColorForMeasure(cellInstanceObjects, "cellLabelColor");
                        }
                        displayStr = strVal;
                        if (showVals) td.textContent = displayStr;
                    } else if (val != null && isFinite(val) && val !== 0) {
                        const t = (val - dataMin) / (dataMax - dataMin);
                        if (hc.active) {
                            // High-contrast fallback (LOOK-04): colour is
                            // replaced by density hatching (dot pitch ∝
                            // value) instead of hue — system slots only.
                            const { pitch } = densityHatching(t);
                            td.style.backgroundColor = hc.background;
                            td.style.backgroundImage = `radial-gradient(circle, ${hc.color} 1px, transparent 1.4px)`;
                            td.style.backgroundSize = `${pitch}px ${pitch}px`;
                            td.style.border = `${hc.borderWidth}px solid ${hc.color}`;
                            td.style.color = hc.color;
                        } else {
                            td.style.backgroundColor = toRgba(colorFor(t), cellTransparencyPct);
                            td.style.backgroundImage = "none";
                            // Peak cell keeps its ramp fill and gains an outline;
                            // every other cell stays borderless as before.
                            td.style.border = (highlightPeak && val === peakValue)
                                ? `${peakBorderWidth}px solid ${peakBorderColor}`
                                : "none";
                            // NEXUS cycle-05 §2: the automatic ink is the
                            // fallback ONLY while the Cell Value Colour swatch
                            // is untouched. An author who sets it card-level
                            // was previously ignored on every nonzero cell —
                            // the swatch reported its value to the formatting
                            // model and painted nothing. Same sentinel as the
                            // zero/blank/text branch, so both value branches
                            // now answer the swatch identically.
                            const inkHelper = new ColorHelper(
                                this.host.colorPalette,
                                { objectName: "labelSettings", propertyName: "cellLabelColor" },
                                cellLabelColorIsAuto ? inkFor(t) : cellLabelColorDefault
                            );
                            td.style.color = inkHelper.getColorForMeasure(cellInstanceObjects, "cellLabelColor");
                        }
                        displayStr = formatVal(val);
                        if (showVals) td.textContent = displayStr;
                    } else {
                        if (hc.active) {
                            td.style.backgroundColor = hc.background;
                            td.style.backgroundImage = "none";
                            td.style.border = `${hc.borderWidth}px solid ${hc.color}`;
                            td.style.color = hc.color;
                        } else {
                            const resolvedZeroColor = this.zeroColorHelper?.getColorForMeasure(cellInstanceObjects, "zeroColor") ?? zeroC;
                            td.style.backgroundColor = toRgba(resolvedZeroColor, cellTransparencyPct);
                            td.style.backgroundImage = "none";
                            td.style.border = "none";
                            // Same per-cell ColorHelper shape as the ramp branch
                            // below/above: an explicit fx rule or per-instance
                            // object wins, and zeroInkFor() is only the fallback.
                            const zeroInkHelper = new ColorHelper(
                                this.host.colorPalette,
                                { objectName: "labelSettings", propertyName: "cellLabelColor" },
                                zeroInkFor(resolvedZeroColor)
                            );
                            // Zero-only peak (NEXUS cycle-05 §6): when every
                            // numeric cell is zero, zero IS the maximum, so the
                            // zero cells are the peak. A zero in a grid with any
                            // larger value is never the peak, and a blank/null
                            // cell never is — it has no value to be maximal.
                            td.style.border = (highlightPeak && val === 0 && peakValue === 0)
                                ? `${peakBorderWidth}px solid ${peakBorderColor}`
                                : "none";
                            td.style.color = zeroInkHelper.getColorForMeasure(cellInstanceObjects, "cellLabelColor");
                        }
                        if (val === 0) displayStr = formatVal(0);
                        if (showVals && val === 0) td.textContent = displayStr;
                    }

                    if (cellSelId) {
                        td.style.cursor = "pointer";
                        td.addEventListener("click", (ev: MouseEvent) => {
                            this.selectionManager.select(cellSelId, ev.ctrlKey || ev.metaKey);
                            ev.stopPropagation();
                        });
                    }

                    // Tooltip (1180.2.2.2 Tool Tips)
                    const tooltipItems: VisualTooltipDataItem[] = [
                        { displayName: rowCat.source.displayName || "Row", value: row },
                        { displayName: colCat.source.displayName || "Column", value: col },
                        { displayName: values.source.displayName || "Value", value: displayStr || "—" }
                    ];
                    td.addEventListener("mousemove", (ev: MouseEvent) => {
                        this.tooltipService.show({
                            coordinates: [ev.clientX, ev.clientY],
                            isTouchEvent: false,
                            dataItems: tooltipItems,
                            identities: cellSelId ? [cellSelId] : []
                        });
                    });
                    td.addEventListener("mouseleave", () => {
                        this.tooltipService.hide({ isTouchEvent: false, immediately: false });
                    });

                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            layoutWrap.appendChild(table);
            this.container.appendChild(layoutWrap);

            // 1180.2.4 — say it out loud when the grid was capped. A heatmap that
            // silently drops most of its data looks complete and is not; the reader
            // has no way to tell. Rendered counts first, then the true totals.
            if (gridTruncated) {
                const notice = document.createElement("div");
                notice.className = "heatmap-truncation-notice";
                notice.textContent =
                    `Showing ${uniqueRows.length.toLocaleString()} of ${fullRowCount.toLocaleString()} rows `
                    + `and ${uniqueCols.length.toLocaleString()} of ${fullColCount.toLocaleString()} columns. `
                    + `Filter the data or use lower-cardinality fields to see all of it.`;
                notice.style.padding = "6px 12px 8px";
                notice.style.fontSize = `${Math.max(10, headerFontSize - 1)}px`;
                notice.style.fontFamily = headerFontFamily;
                notice.style.color = headerColor;
                notice.style.opacity = hc.active ? "1" : "0.85";
                this.container.appendChild(notice);
            }

            if (showAxes && xAxisTitleText) {
                const xAx = document.createElement("div");
                xAx.style.padding = "6px 0 0";
                xAx.style.textAlign = "center";
                xAx.style.fontSize = `${headerFontSize}px`;
                xAx.style.fontWeight = "600";
                xAx.style.color = headerColor;
                xAx.textContent = xAxisTitleText;
                this.container.appendChild(xAx);
            }

            // v3 corner-bracket card signature — re-appended last (moves the
            // existing elements to the end of the DOM, since the "Clear"
            // step above removed them along with the rest of the previous
            // render) so they keep painting above the title/table.
            this.cornerSignature?.elements.forEach((el) => this.container.appendChild(el));
            applyCardSignature(this.cornerSignature, this.formattingSettings.cardSignature, {
                autoHex: accentHex,
                hcActive: hc.active,
                hcColor: hc.color,
                glowMix: hc.active ? 0 : (theme === "dark" ? 55 : 0),
                muted: false,
            });

            this.eventService.renderingFinished(options);
        } catch (e) {
            this.eventService.renderingFailed(options, String(e));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        // Drop the in-flight licence check FIRST: its redraw callback replays
        // update() against a torn-down target otherwise (NEXUS lifecycle finding).
        this.licenseGate.dispose();
        this.cornerSignature?.destroy();
        this.cornerSignature = null;
        while (this.container && this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        this.container = null;
        this.target = null;
    }
}
