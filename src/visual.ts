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

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;
        this.eventService = options.host.eventService;
        this.selectionManager = this.host.createSelectionManager();
        this.localizationManager = this.host.createLocalizationManager();

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
                if (titleSettings.titleFontSize?.value) {
                    titleEl.style.fontSize = `${titleSettings.titleFontSize.value}px`;
                }
                if (titleSettings.titleColor?.value?.value) {
                    titleEl.style.color = titleSettings.titleColor.value.value;
                }
                titleEl.style.padding = "8px 12px 4px";
                titleEl.style.fontWeight = "600";
                this.container.appendChild(titleEl);
            }

            // Render bare table — no tooltips, no cross-filtering, no axis titles
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

                if (isFinite(numVal) && numVal !== 0) {
                    if (numVal < dataMin) dataMin = numVal;
                    if (numVal > dataMax) dataMax = numVal;
                }
            }

            if (!isFinite(dataMin)) dataMin = 0;
            if (!isFinite(dataMax)) dataMax = 0;
            if (dataMin === dataMax) { dataMin -= 1; dataMax += 1; }

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
                tr.appendChild(rowLabel);

                const rowMap = dataMap.get(row);
                for (const col of uniqueCols) {
                    const td = document.createElement("td");
                    td.className = "heatmap-cell";
                    const val = rowMap ? rowMap.get(col) : undefined;
                    if (val != null && isFinite(val) && val !== 0) {
                        const t = (val - dataMin) / (dataMax - dataMin);
                        const r = Math.round(224 + t * (253 - 224));
                        const g = Math.round(245 + t * (232 - 245));
                        const b = Math.round(239 + t * (234 - 239));
                        td.style.backgroundColor = `rgb(${r},${g},${b})`;
                        td.textContent = String(val);
                    }
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            this.container.appendChild(table);

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
