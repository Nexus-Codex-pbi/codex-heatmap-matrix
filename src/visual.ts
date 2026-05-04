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

import { VisualFormattingSettingsModel } from "./settings";

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

    constructor(options: VisualConstructorOptions) {
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
    }

    public update(options: VisualUpdateOptions): void {
        this.eventService.renderingStarted(options);

        try {
            const dataView: DataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel, dataView
            );

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
                titleEl.style.textAlign = (titleSettings.titleAlign?.value as string) || "left";
                if (titleSettings.titleColor?.value?.value) {
                    titleEl.style.color = titleSettings.titleColor.value.value;
                }
                titleEl.style.padding = "8px 12px 4px";
                this.container.appendChild(titleEl);
            }

            const categorical = dataView.categorical;
            const categories = categorical.categories;
            const values = categorical.values[0];

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
                this.eventService.renderingFinished(options);
                return;
            }

            const rowCat = categories[rowCatIndex];
            const colCat = categories[colCatIndex];

            const dataMap = new Map<string, Map<string, number>>();
            const cellIndexMap = new Map<string, number>(); // "row|col" -> source index
            const uniqueRows: string[] = [];
            const uniqueCols: string[] = [];
            const rowSet = new Set<string>();
            const colSet = new Set<string>();

            let dataMin = Infinity;
            let dataMax = -Infinity;

            for (let i = 0; i < rowCat.values.length; i++) {
                const rowKey = String(rowCat.values[i] ?? "");
                const colKey = String(colCat.values[i] ?? "");
                const rawVal = values.values[i];
                const numVal = typeof rawVal === "number" ? rawVal : Number(rawVal);

                if (!rowSet.has(rowKey)) { rowSet.add(rowKey); uniqueRows.push(rowKey); }
                if (!colSet.has(colKey)) { colSet.add(colKey); uniqueCols.push(colKey); }

                if (!dataMap.has(rowKey)) dataMap.set(rowKey, new Map<string, number>());
                dataMap.get(rowKey).set(colKey, numVal);

                const cellKey = `${rowKey}|${colKey}`;
                if (!cellIndexMap.has(cellKey)) cellIndexMap.set(cellKey, i);

                if (isFinite(numVal) && numVal !== 0) {
                    if (numVal < dataMin) dataMin = numVal;
                    if (numVal > dataMax) dataMax = numVal;
                }
            }

            if (!isFinite(dataMin)) dataMin = 0;
            if (!isFinite(dataMax)) dataMax = 0;
            if (dataMin === dataMax) { dataMin -= 1; dataMax += 1; }

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
            const midC = heat?.midColor?.value?.value || "#fef3d6";
            const highC = heat?.highColor?.value?.value || "#fde8ea";
            const zeroC = heat?.zeroColor?.value?.value || "#f0eee6";

            const cellRadius = heat?.cellBorderRadius?.value ?? 4;
            const showVals = heat?.showValues?.value !== false;
            const valueFormat = (heat?.valueFormat?.value as { value?: string })?.value || "number";
            const decimals = heat?.decimalPlaces?.value ?? 0;

            const cellFontSize = lbl?.fontSize?.value ?? 12;
            const headerFontSize = lbl?.headerFontSize?.value ?? 11;
            const headerColor = lbl?.fontColor?.value?.value || "#333333";

            const formatVal = (n: number): string => {
                if (valueFormat === "percent") {
                    return `${(n * 100).toFixed(decimals)}%`;
                }
                return n.toLocaleString(undefined, {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals
                });
            };

            const colorFor = (t: number): string => {
                const lerp = (a: string, b: string, k: number): string => {
                    const pa = parseInt(a.slice(1, 3), 16), pb = parseInt(b.slice(1, 3), 16);
                    const ga = parseInt(a.slice(3, 5), 16), gb = parseInt(b.slice(3, 5), 16);
                    const ba = parseInt(a.slice(5, 7), 16), bb = parseInt(b.slice(5, 7), 16);
                    const r = Math.round(pa + k * (pb - pa));
                    const g = Math.round(ga + k * (gb - ga));
                    const bl = Math.round(ba + k * (bb - ba));
                    return `rgb(${r},${g},${bl})`;
                };
                if (schemeVal === "greenToRed") {
                    return t < 0.5 ? lerp("#e0f5ef", "#fef3d6", t * 2) : lerp("#fef3d6", "#fde8ea", (t - 0.5) * 2);
                }
                if (schemeVal === "redToGreen") {
                    return t < 0.5 ? lerp("#fde8ea", "#fef3d6", t * 2) : lerp("#fef3d6", "#e0f5ef", (t - 0.5) * 2);
                }
                if (schemeVal === "sequential") {
                    return lerp("#e3f2fd", "#0d47a1", t);
                }
                // custom
                return t < 0.5 ? lerp(lowC, midC, t * 2) : lerp(midC, highC, (t - 0.5) * 2);
            };

            // Layout: optional yAxisTitle (left) + table; xAxisTitle below
            const showAxes = ax?.showAxisTitles?.value === true;
            const xAxisTitleText = ax?.xAxisTitle?.value || "";
            const yAxisTitleText = ax?.yAxisTitle?.value || "";

            const layoutWrap = document.createElement("div");
            layoutWrap.style.display = "flex";
            layoutWrap.style.flexDirection = "row";
            layoutWrap.style.alignItems = "stretch";
            layoutWrap.style.width = "100%";

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
                tr.appendChild(rowLabel);

                const rowMap = dataMap.get(row);
                for (const col of uniqueCols) {
                    const td = document.createElement("td");
                    td.className = "heatmap-cell";
                    td.style.borderRadius = `${cellRadius}px`;
                    td.style.fontSize = `${cellFontSize}px`;
                    const val = rowMap ? rowMap.get(col) : undefined;
                    let displayStr = "";
                    if (val != null && isFinite(val) && val !== 0) {
                        const t = (val - dataMin) / (dataMax - dataMin);
                        td.style.backgroundColor = colorFor(t);
                        displayStr = formatVal(val);
                        if (showVals) td.textContent = displayStr;
                    } else {
                        td.style.backgroundColor = zeroC;
                        if (val === 0) displayStr = formatVal(0);
                        if (showVals && val === 0) td.textContent = displayStr;
                    }

                    // Build selectionId for this cell (1180.2.2.3 Filter Out)
                    const cellIdx = cellIndexMap.get(`${row}|${col}`);
                    let cellSelId: ISelectionId | null = null;
                    if (cellIdx !== undefined) {
                        try {
                            cellSelId = this.host.createSelectionIdBuilder()
                                .withCategory(rowCat, cellIdx)
                                .withCategory(colCat, cellIdx)
                                .createSelectionId();
                        } catch { cellSelId = null; }
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

            this.eventService.renderingFinished(options);
        } catch (e) {
            this.eventService.renderingFailed(options, String(e));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        while (this.container && this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        this.container = null;
        this.target = null;
    }
}
