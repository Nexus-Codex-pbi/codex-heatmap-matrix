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
import { contrastText, interpolateThreeColor } from "./utils";

// Weekday sort order for "weekday" column ordering
const WEEKDAY_ORDER: Record<string, number> = {
    "mon": 0, "monday": 0,
    "tue": 1, "tuesday": 1,
    "wed": 2, "wednesday": 2,
    "thu": 3, "thursday": 3,
    "fri": 4, "friday": 4,
    "sat": 5, "saturday": 5,
    "sun": 6, "sunday": 6
};

export class Visual implements IVisual {
    private target: HTMLElement;
    private host: IVisualHost;
    private eventService: IVisualEventService;
    private selectionManager: ISelectionManager;
    private localizationManager: ILocalizationManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private tooltipService: ITooltipService;
    private container: HTMLElement;
    private contentWrapper: HTMLElement;
    private isHighContrast: boolean = false;
    private highContrastForeground: string = "";
    private highContrastBackground: string = "";
    private contextMenuHandler: (e: MouseEvent) => void;

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;
        this.eventService = options.host.eventService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = this.host.tooltipService;
        this.localizationManager = this.host.createLocalizationManager();

        // High contrast detection
        const colorPalette = this.host.colorPalette as any;
        if (colorPalette.isHighContrast) {
            this.isHighContrast = true;
            this.highContrastForeground = colorPalette.foreground.value;
            this.highContrastBackground = colorPalette.background.value;
        }

        // Fill the entire visual bounding box — no gaps for dead-zone clicks
        this.target.style.margin = "0";
        this.target.style.padding = "0";
        this.target.style.overflow = "hidden";
        this.target.style.display = "block";

        this.container = document.createElement("div");
        this.container.className = "heatmap-container";
        this.container.style.position = "relative";
        this.container.style.width = "100%";
        this.container.style.height = "100%";
        this.target.appendChild(this.container);

        // Content wrapper — table and axis titles go here.
        this.contentWrapper = document.createElement("div");
        this.contentWrapper.style.position = "relative";
        this.contentWrapper.style.zIndex = "2";
        this.container.appendChild(this.contentWrapper);

        // SVG overlay filling the entire container catches contextmenu in
        // empty space (title gap, subtitle, below-table) — Policy 1180.2.5.
        // SVG rect reliably receives pointer events in PBI sandbox unlike
        // plain divs. Transparent fill makes it invisible but clickable.
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.zIndex = "1";
        svg.style.pointerEvents = "none";

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", "0");
        rect.setAttribute("y", "0");
        rect.setAttribute("width", "100%");
        rect.setAttribute("height", "100%");
        rect.setAttribute("fill", "transparent");
        rect.style.pointerEvents = "all";
        svg.appendChild(rect);

        this.container.appendChild(svg);

        // Context menu handler — SVG rect catches clicks in empty space
        this.contextMenuHandler = (e: MouseEvent) => {
            this.selectionManager.showContextMenu({} as powerbi.extensibility.ISelectionId, { x: e.clientX, y: e.clientY });
            e.preventDefault();
            return false;
        };
        this.target.addEventListener("contextmenu", this.contextMenuHandler);
        this.container.addEventListener("contextmenu", this.contextMenuHandler);
        rect.addEventListener("contextmenu", this.contextMenuHandler);
        document.addEventListener("contextmenu", this.contextMenuHandler, true);
    }

    public update(options: VisualUpdateOptions): void {
        this.eventService.renderingStarted(options);

        try {
            // Refresh high contrast state each update
            const colorPalette = this.host.colorPalette as any;
            if (colorPalette.isHighContrast) {
                this.isHighContrast = true;
                this.highContrastForeground = colorPalette.foreground.value;
                this.highContrastBackground = colorPalette.background.value;
            } else {
                this.isHighContrast = false;
            }

            const dataView: DataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel, dataView
            );

            // Clear previous render content (preserves overlay)
            while (this.contentWrapper.firstChild) {
                this.contentWrapper.removeChild(this.contentWrapper.firstChild);
            }

            if (!dataView || !dataView.categorical || !dataView.categorical.categories
                || dataView.categorical.categories.length < 2
                || !dataView.categorical.values || dataView.categorical.values.length < 1) {
                this.renderEmpty();
                this.eventService.renderingFinished(options);
                return;
            }

            const categorical = dataView.categorical;
            const categories = categorical.categories;
            const values = categorical.values[0];

            // Find sort order values column (if provided)
            let sortOrderValues: powerbi.DataViewValueColumn | null = null;
            for (let vi = 0; vi < categorical.values.length; vi++) {
                const roles = categorical.values[vi].source.roles;
                if (roles && roles["sortOrder"]) {
                    sortOrderValues = categorical.values[vi];
                    break;
                }
            }

            // Identify which category is rowCategory vs columnCategory by role
            let rowCatIndex = -1;
            let colCatIndex = -1;
            for (let i = 0; i < categories.length; i++) {
                const roles = categories[i].source.roles;
                if (roles && roles["rowCategory"]) rowCatIndex = i;
                if (roles && roles["columnCategory"]) colCatIndex = i;
            }

            if (rowCatIndex < 0 || colCatIndex < 0) {
                this.renderEmpty();
                this.eventService.renderingFinished(options);
                return;
            }

            const rowCat = categories[rowCatIndex];
            const colCat = categories[colCatIndex];

            // Build pivot: row -> column -> value
            const dataMap = new Map<string, Map<string, number>>();
            const stringDataMap = new Map<string, Map<string, string>>();
            let isStringMode = false;
            const uniqueRows: string[] = [];
            const uniqueCols: string[] = [];
            const rowSet = new Set<string>();
            const colSet = new Set<string>();
            const rowSortOrder = new Map<string, number>();

            let dataMin = Infinity;
            let dataMax = -Infinity;

            for (let i = 0; i < rowCat.values.length; i++) {
                const rowKey = String(rowCat.values[i] ?? "");
                const colKey = String(colCat.values[i] ?? "");
                const rawVal = values.values[i];

                // Detect string-valued cells and handle them separately
                const isStringVal = typeof rawVal === "string" && isNaN(Number(rawVal));
                if (isStringVal) {
                    isStringMode = true;
                }

                const numVal = typeof rawVal === "number" ? rawVal : Number(rawVal);
                const strVal = String(rawVal ?? "");

                if (!rowSet.has(rowKey)) {
                    rowSet.add(rowKey);
                    uniqueRows.push(rowKey);
                }
                if (!colSet.has(colKey)) {
                    colSet.add(colKey);
                    uniqueCols.push(colKey);
                }

                if (!dataMap.has(rowKey)) {
                    dataMap.set(rowKey, new Map<string, number>());
                }
                if (!stringDataMap.has(rowKey)) {
                    stringDataMap.set(rowKey, new Map<string, string>());
                }

                if (isStringVal) {
                    stringDataMap.get(rowKey).set(colKey, strVal);
                    dataMap.get(rowKey).set(colKey, NaN);
                } else {
                    dataMap.get(rowKey).set(colKey, numVal);
                    stringDataMap.get(rowKey).set(colKey, strVal);
                }

                // Track sort order per row (use first encountered value for each row)
                if (sortOrderValues && !rowSortOrder.has(rowKey)) {
                    const sortVal = sortOrderValues.values[i] as number;
                    if (sortVal != null && !isNaN(sortVal)) {
                        rowSortOrder.set(rowKey, sortVal);
                    }
                }

                if (isFinite(numVal) && numVal !== 0) {
                    if (numVal < dataMin) dataMin = numVal;
                    if (numVal > dataMax) dataMax = numVal;
                }
            }

            // Sort rows by sort order (ascending) if sort order values are provided
            if (rowSortOrder.size > 0) {
                uniqueRows.sort((a, b) => {
                    const aOrder = rowSortOrder.get(a) ?? Infinity;
                    const bOrder = rowSortOrder.get(b) ?? Infinity;
                    return aOrder - bOrder;
                });
            }

            // Handle edge case where all values are the same or no valid values
            if (!isFinite(dataMin)) dataMin = 0;
            if (!isFinite(dataMax)) dataMax = 0;
            if (dataMin === dataMax) {
                dataMin = dataMin - 1;
                dataMax = dataMax + 1;
            }

            // Read settings
            const heatSettings = this.formattingSettings.heatmapSettings;
            const colSettings = this.formattingSettings.columnSettings;
            const lblSettings = this.formattingSettings.labelSettings;

            // Sort columns
            const columnOrder = colSettings.columnOrder.value.value as string;
            let sortedCols = [...uniqueCols];
            if (columnOrder === "weekday") {
                sortedCols.sort((a, b) => {
                    const aIdx = WEEKDAY_ORDER[a.toLowerCase()] ?? 99;
                    const bIdx = WEEKDAY_ORDER[b.toLowerCase()] ?? 99;
                    return aIdx - bIdx;
                });
            }

            // Determine colour stops based on scheme
            const scheme = heatSettings.colorScheme.value.value as string;
            let lowColor: string, midColor: string, highColor: string;

            switch (scheme) {
                case "greenToRed":
                    lowColor = "#e0f5ef";
                    midColor = "#fef3d6";
                    highColor = "#fde8ea";
                    break;
                case "redToGreen":
                    lowColor = "#fde8ea";
                    midColor = "#fef3d6";
                    highColor = "#e0f5ef";
                    break;
                case "sequential":
                    lowColor = "#f7fbff";
                    midColor = "#6baed6";
                    highColor = "#08306b";
                    break;
                case "custom":
                default:
                    lowColor = heatSettings.lowColor.value.value;
                    midColor = heatSettings.midColor.value.value;
                    highColor = heatSettings.highColor.value.value;
                    break;
            }

            const zeroColor = this.isHighContrast ? this.highContrastBackground : heatSettings.zeroColor.value.value;
            const borderRadius = heatSettings.cellBorderRadius.value;
            const showValues = heatSettings.showValues.value;
            const valueFormat = heatSettings.valueFormat.value.value as string;
            const decimalPlaces = heatSettings.decimalPlaces.value;
            const fontSize = lblSettings.fontSize.value;
            const headerFontSize = lblSettings.headerFontSize.value;
            const fontColor = this.isHighContrast ? this.highContrastForeground : lblSettings.fontColor.value.value;

            // Build HTML table
            const table = document.createElement("table");
            table.className = "heatmap-table";

            // Header row
            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");

            // Corner cell (empty, above row labels)
            const cornerCell = document.createElement("th");
            cornerCell.className = "heatmap-corner";
            headerRow.appendChild(cornerCell);

            for (const col of sortedCols) {
                const th = document.createElement("th");
                th.className = "heatmap-col-header";
                th.textContent = col;
                th.style.fontSize = headerFontSize + "px";
                th.style.color = fontColor;
                headerRow.appendChild(th);
            }
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Build a lookup from (rowKey, colKey) to the original data index for selection IDs
            const cellIndexMap = new Map<string, number>();
            for (let i = 0; i < rowCat.values.length; i++) {
                const rk = String(rowCat.values[i] ?? "");
                const ck = String(colCat.values[i] ?? "");
                cellIndexMap.set(rk + "\0" + ck, i);
            }

            // Data rows
            const tbody = document.createElement("tbody");
            for (const row of uniqueRows) {
                const tr = document.createElement("tr");

                // Row label
                const rowLabel = document.createElement("td");
                rowLabel.className = "heatmap-row-label";
                rowLabel.textContent = row;
                rowLabel.style.fontSize = headerFontSize + "px";
                rowLabel.style.color = fontColor;
                tr.appendChild(rowLabel);

                const rowMap = dataMap.get(row);
                const strRowMap = stringDataMap.get(row);

                for (const col of sortedCols) {
                    const td = document.createElement("td");
                    td.className = "heatmap-cell";
                    td.style.borderRadius = borderRadius + "px";
                    td.style.cursor = "pointer";

                    const val = rowMap ? rowMap.get(col) : undefined;
                    const strVal = strRowMap ? strRowMap.get(col) : "";
                    let displayText = "";

                    // String-valued cell: show text with default background
                    if (strVal && isNaN(Number(strVal))) {
                        td.style.backgroundColor = this.isHighContrast ? this.highContrastBackground : "#f5f4f0";
                        td.style.color = this.isHighContrast ? this.highContrastForeground : "#1a1a1a";
                        if (showValues) {
                            displayText = strVal;
                            td.textContent = displayText;
                        }
                    } else if (val == null || isNaN(val) || val === 0) {
                        // Zero or null cell
                        td.style.backgroundColor = zeroColor;
                        td.style.color = this.isHighContrast ? this.highContrastForeground : contrastText(zeroColor);
                        if (showValues) {
                            displayText = val === 0 ? "0" : (strVal || "");
                            td.textContent = displayText;
                        }
                    } else {
                        if (this.isHighContrast) {
                            td.style.backgroundColor = this.highContrastBackground;
                            td.style.color = this.highContrastForeground;
                            td.style.border = "1px solid " + this.highContrastForeground;
                        } else {
                            // Interpolate colour based on normalised position
                            const t = (val - dataMin) / (dataMax - dataMin);
                            const bgColor = interpolateThreeColor(lowColor, midColor, highColor, t);
                            td.style.backgroundColor = bgColor;
                            td.style.color = contrastText(bgColor);
                        }

                        if (showValues) {
                            if (valueFormat === "percent") {
                                displayText = (val * 100).toFixed(decimalPlaces) + "%";
                            } else {
                                displayText = val.toFixed(decimalPlaces);
                            }
                            td.textContent = displayText;
                        }
                    }

                    td.style.fontSize = fontSize + "px";

                    // Build tooltip data items for this cell
                    const cellRow = row;
                    const cellCol = col;
                    const cellVal = val;
                    const cellDisplayText = displayText || strVal || (cellVal != null ? String(cellVal) : "");

                    // Build selection ID for cross-filtering
                    const dataIdx = cellIndexMap.get(row + "\0" + col);
                    let selectionId: ISelectionId | null = null;
                    if (dataIdx != null) {
                        selectionId = this.host.createSelectionIdBuilder()
                            .withCategory(rowCat, dataIdx)
                            .createSelectionId();
                    }

                    // Tooltip on mousemove
                    td.addEventListener("mousemove", (e: MouseEvent) => {
                        const tooltipItems: VisualTooltipDataItem[] = [
                            { displayName: rowCat.source.displayName, value: cellRow },
                            { displayName: colCat.source.displayName, value: cellCol },
                            { displayName: values.source.displayName, value: cellDisplayText }
                        ];
                        this.tooltipService.show({
                            coordinates: [e.clientX, e.clientY],
                            isTouchEvent: false,
                            dataItems: tooltipItems,
                            identities: selectionId ? [selectionId] : []
                        });
                    });

                    td.addEventListener("mouseleave", () => {
                        this.tooltipService.hide({ isTouchEvent: false, immediately: false });
                    });

                    // Cross-filtering on click
                    td.addEventListener("click", (e: MouseEvent) => {
                        if (selectionId) {
                            this.selectionManager.select(selectionId, e.ctrlKey || e.metaKey);
                        }
                        e.stopPropagation();
                    });

                    tr.appendChild(td);
                }

                tbody.appendChild(tr);
            }
            table.appendChild(tbody);

            // Axis titles
            const axSettings = this.formattingSettings.axisSettings;
            const showAxisTitles = axSettings.showAxisTitles.value;
            const xAxisTitle = axSettings.xAxisTitle.value || "";
            const yAxisTitle = axSettings.yAxisTitle.value || "";

            if (showAxisTitles && (xAxisTitle || yAxisTitle)) {
                const axisTitleFontSize = headerFontSize + 2;
                const axisTitleColor = this.isHighContrast ? this.highContrastForeground : fontColor;

                // Wrap table in a flex layout for Y axis title positioning
                const wrapper = document.createElement("div");
                wrapper.style.display = "flex";
                wrapper.style.flexDirection = "row";
                wrapper.style.alignItems = "stretch";
                wrapper.style.width = "100%";

                if (yAxisTitle) {
                    const yTitleEl = document.createElement("div");
                    yTitleEl.style.display = "flex";
                    yTitleEl.style.alignItems = "center";
                    yTitleEl.style.justifyContent = "center";
                    yTitleEl.style.writingMode = "vertical-rl";
                    yTitleEl.style.transform = "rotate(180deg)";
                    yTitleEl.style.fontSize = axisTitleFontSize + "px";
                    yTitleEl.style.fontWeight = "600";
                    yTitleEl.style.color = axisTitleColor;
                    yTitleEl.style.fontFamily = "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
                    yTitleEl.style.paddingRight = "6px";
                    yTitleEl.textContent = yAxisTitle;
                    wrapper.appendChild(yTitleEl);
                }

                const tableWrapper = document.createElement("div");
                tableWrapper.style.flex = "1";
                tableWrapper.style.minWidth = "0";
                tableWrapper.style.overflow = "auto";
                tableWrapper.appendChild(table);
                wrapper.appendChild(tableWrapper);

                this.contentWrapper.appendChild(wrapper);

                if (xAxisTitle) {
                    const xTitleEl = document.createElement("div");
                    xTitleEl.style.textAlign = "center";
                    xTitleEl.style.fontSize = axisTitleFontSize + "px";
                    xTitleEl.style.fontWeight = "600";
                    xTitleEl.style.color = axisTitleColor;
                    xTitleEl.style.fontFamily = "Segoe UI, Tahoma, Geneva, Verdana, sans-serif";
                    xTitleEl.style.paddingTop = "6px";
                    xTitleEl.textContent = xAxisTitle;
                    this.contentWrapper.appendChild(xTitleEl);
                }
            } else {
                this.contentWrapper.appendChild(table);
            }

            this.eventService.renderingFinished(options);
        } catch (e) {
            this.eventService.renderingFailed(options, String(e));
        }
    }

    private renderEmpty(): void {
        const msg = document.createElement("div");
        msg.className = "heatmap-empty";
        msg.textContent = this.localizationManager.getDisplayName("Visual_Landing_Message");
        if (this.isHighContrast) {
            msg.style.color = this.highContrastForeground;
        }
        this.contentWrapper.appendChild(msg);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        if (this.target) {
            this.target.removeEventListener("contextmenu", this.contextMenuHandler);
        }
        if (this.container) {
            this.container.removeEventListener("contextmenu", this.contextMenuHandler);
        }
        document.removeEventListener("contextmenu", this.contextMenuHandler, true);
        while (this.container && this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        this.container = null;
        this.target = null;
    }
}
