"use strict";

import powerbi from "powerbi-visuals-api";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

import { BackgroundSettings } from "./shared/backgroundSettings";
import { TitleSettings } from "./shared/titleSettings";
import { textAlignFor } from "./shared/textFormatting";
import { CardSignatureSettings } from "./shared/cardSignatureSettings";
import { BorderSettings } from "./shared/borderSettings";

// TitleSettings now lives in _shared/formatting/ (D-13, D-14 — Plan 10
// pilot); this visual's inline TitleSettingsCard (identical field-for-field
// shape, already matching capabilities.json's titleSettings object exactly)
// is deleted below and replaced by this import — no capabilities.json
// change needed (schema was already byte-identical). Re-exported so
// visual.ts can import from "./settings" (mirrors pbiKpiCard's shape).
export { TitleSettings, textAlignFor };

const ConstantOrRule = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;

class HeatmapSettingsCard extends FormattingSettingsCard {
    // v3 default flip (LOOK-04, D-16): the declared default moves from
    // "greenToRed" to "sequential" so a brand-new (or never-touched) report
    // renders the v2 single-hue perceptual ramp by default. "greenToRed"/
    // "redToGreen" keep their literal RAG-diverging meaning (now resolved
    // via the sanctioned ragScale() exception) for anyone who explicitly
    // picks them; "sequential"/"custom" render via the single-hue
    // heatmapRamp() formula. No enum values renamed or added —
    // capabilities.json is untouched.
    colorScheme = new formattingSettings.ItemDropdown({
        name: "colorScheme",
        displayName: "Colour Scheme",
        items: [
            { displayName: "Green to Red", value: "greenToRed" },
            { displayName: "Red to Green", value: "redToGreen" },
            { displayName: "Sequential", value: "sequential" },
            { displayName: "Custom", value: "custom" }
        ],
        value: { displayName: "Sequential", value: "sequential" }
    });

    lowColor = new formattingSettings.ColorPicker({
        name: "lowColor",
        displayName: "Low Colour",
        description: "Colour for the lowest value (used in Custom scheme)",
        value: { value: "#e0f5ef" },
        instanceKind: ConstantOrRule
    });

    // Superseded by the v3 2-stop heatmapRamp() formula under the Custom
    // scheme (LOOK-04, mix(lowColor, highColor, t)) — kept in the pane for
    // saved-report compatibility; no longer read at render (D-16/D-06).
    midColor = new formattingSettings.ColorPicker({
        name: "midColor",
        displayName: "Mid Colour",
        description: "Colour for the midpoint value (used in Custom scheme)",
        value: { value: "#fef3d6" },
        instanceKind: ConstantOrRule
    });

    highColor = new formattingSettings.ColorPicker({
        name: "highColor",
        displayName: "High Colour",
        description: "Colour for the highest value (used in Custom scheme)",
        value: { value: "#fde8ea" },
        instanceKind: ConstantOrRule
    });

    zeroColor = new formattingSettings.ColorPicker({
        name: "zeroColor",
        displayName: "Zero / Null Colour",
        description: "Colour for zero or missing values",
        value: { value: "#f0eee6" },
        instanceKind: ConstantOrRule
    });

    cellBorderRadius = new formattingSettings.NumUpDown({
        name: "cellBorderRadius",
        displayName: "Cell Border Radius",
        description: "Corner rounding for each cell (px)",
        value: 4
    });

    // Per-region transparency (D-05) sibling to the existing cell colour
    // pickers above (lowColor/midColor/highColor/zeroColor) — cells are
    // ALWAYS painted a colour today (either the gradient or zeroColor), so
    // the pre-existing default is fully opaque; 0 (opaque) preserves old
    // saved reports pixel-identical (D-06), no override needed.
    cellTransparency = new formattingSettings.Slider({
        name: "cellTransparency",
        displayName: "Cell Transparency",
        description: "Transparency applied to cell fill colours",
        value: 0,
        options: {
            minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
            maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 100 }
        }
    });

    showValues = new formattingSettings.ToggleSwitch({
        name: "showValues",
        displayName: "Show Values",
        description: "Display numeric values inside cells",
        value: true
    });

    valueFormat = new formattingSettings.ItemDropdown({
        name: "valueFormat",
        displayName: "Value Format",
        items: [
            { displayName: "Number", value: "number" },
            { displayName: "Percent", value: "percent" }
        ],
        value: { displayName: "Number", value: "number" }
    });

    decimalPlaces = new formattingSettings.NumUpDown({
        name: "decimalPlaces",
        displayName: "Decimal Places",
        value: 0
    });

    // Peak highlight — outlines the single highest-valued cell so the eye lands
    // on it immediately. Default OFF: this is a LIVE certified visual and the
    // suite rule is additive-only, so an existing saved report must render
    // exactly as before until the author opts in.
    highlightPeak = new formattingSettings.ToggleSwitch({
        name: "highlightPeak",
        displayName: "Highlight Peak",
        description: "Outline the highest-valued cell in the matrix",
        value: false
    });

    peakBorderColor = new formattingSettings.ColorPicker({
        name: "peakBorderColor",
        displayName: "Peak Border Colour",
        description: "Outline colour for the highest-valued cell",
        value: { value: "#FFFFFF" }
    });

    peakBorderWidth = new formattingSettings.NumUpDown({
        name: "peakBorderWidth",
        displayName: "Peak Border Width",
        description: "Outline thickness for the highest-valued cell",
        value: 2,
        options: {
            minValue: { type: powerbi.visuals.ValidatorType.Min, value: 1 },
            maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 6 }
        }
    });

    name: string = "heatmapSettings";
    displayName: string = "Heatmap";
    slices: Array<FormattingSettingsSlice> = [
        this.colorScheme,
        this.lowColor,
        this.midColor,
        this.highColor,
        this.zeroColor,
        this.cellBorderRadius,
        this.cellTransparency,
        this.showValues,
        this.valueFormat,
        this.decimalPlaces,
        this.highlightPeak,
        this.peakBorderColor,
        this.peakBorderWidth
    ];
}

class ColumnSettingsCard extends FormattingSettingsCard {
    columnOrder = new formattingSettings.ItemDropdown({
        name: "columnOrder",
        displayName: "Column Order",
        description: "How to sort columns",
        items: [
            { displayName: "Auto", value: "auto" },
            { displayName: "Weekday", value: "weekday" }
        ],
        value: { displayName: "Auto", value: "auto" }
    });

    name: string = "columnSettings";
    displayName: string = "Columns";
    slices: Array<FormattingSettingsSlice> = [
        this.columnOrder
    ];
}

class LabelSettingsCard extends FormattingSettingsCard {
    // ─── Cell value label text (TEXT-01/02) ──────────────────────────
    // FontControl composite reuses the existing bare "fontSize" property
    // name (D-06/D-07: additive-only, no schema rename) alongside NEW
    // sibling properties (family/bold/italic/underline). Bold defaults
    // false — the pre-existing hardcoded .heatmap-cell font-weight is 500
    // (below the semibold/600 threshold the suite's weightFor idiom treats
    // as bold-worthy). cellLabelColor is a brand-new colour surface — cell
    // text previously had no explicit colour (CSS-inherited default,
    // effectively #000000), so the new default matches pixel-identical
    // (D-06). Alignment omitted — cell text is already centred via
    // .heatmap-cell's layout-determined text-align (matches 01-11/01-12/
    // 01-13 precedent: only the shared Title gets Alignment).
    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Cell Font Size",
        description: "Font size for cell values (px)",
        value: 12
    });

    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Cell Font Family", value: "Segoe UI, sans-serif" });
    bold = new formattingSettings.ToggleSwitch({ name: "bold", displayName: "Cell Bold", value: false });
    italic = new formattingSettings.ToggleSwitch({ name: "italic", displayName: "Cell Italic", value: false });
    underline = new formattingSettings.ToggleSwitch({ name: "underline", displayName: "Cell Underline", value: false });

    cellLabelFont = new formattingSettings.FontControl({
        name: "cellLabelFont", displayName: "Cell Value Font",
        fontFamily: this.fontFamily, fontSize: this.fontSize,
        bold: this.bold, italic: this.italic, underline: this.underline,
    });

    cellLabelColor = new formattingSettings.ColorPicker({
        name: "cellLabelColor",
        displayName: "Cell Value Colour",
        description: "Colour for the numeric value text drawn on each cell (distinct from the cell fill)",
        value: { value: "#000000" },
        instanceKind: ConstantOrRule
    });

    // ─── Row/column header text (TEXT-01) ────────────────────────────
    // FontControl composite reuses the existing bare "headerFontSize"
    // property name alongside NEW prefixed sibling properties (avoids
    // colliding with the cell font's bare family/bold/italic/underline
    // names above, both live on the same labelSettings card). Bold
    // defaults true — both header surfaces (.heatmap-col-header
    // weight:700, .heatmap-row-label weight:600) are semibold-or-bolder
    // pre-existing weights (weightFor idiom, matches pbiVarianceWaterfall/
    // pbiNowVsThen precedent). fontColor (pre-existing, header colour) gets
    // instanceKind ConstantOrRule added — no fx selector/altConstantSelector
    // wiring (out of this plan's scope; only Cell Value Colour gets full
    // fx wiring per the plan's acceptance criteria, matching the
    // pbiBulletChart Labels/Axis precedent). Alignment omitted — column
    // headers are centred and row labels are right-aligned via existing
    // layout-determined CSS (matches 01-11/01-12/01-13 precedent).
    headerFontSize = new formattingSettings.NumUpDown({
        name: "headerFontSize",
        displayName: "Header Font Size",
        description: "Font size for column/row headers (px)",
        value: 11
    });

    headerFontFamily = new formattingSettings.FontPicker({ name: "headerFontFamily", displayName: "Header Font Family", value: "Segoe UI, sans-serif" });
    headerBold = new formattingSettings.ToggleSwitch({ name: "headerBold", displayName: "Header Bold", value: true });
    headerItalic = new formattingSettings.ToggleSwitch({ name: "headerItalic", displayName: "Header Italic", value: false });
    headerUnderline = new formattingSettings.ToggleSwitch({ name: "headerUnderline", displayName: "Header Underline", value: false });

    headerFont = new formattingSettings.FontControl({
        name: "headerFont", displayName: "Header Font",
        fontFamily: this.headerFontFamily, fontSize: this.headerFontSize,
        bold: this.headerBold, italic: this.headerItalic, underline: this.headerUnderline,
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Header Font Colour",
        description: "Colour for row and column header text",
        value: { value: "#333333" },
        instanceKind: ConstantOrRule
    });

    name: string = "labelSettings";
    displayName: string = "Labels";
    slices: Array<FormattingSettingsSlice> = [
        this.cellLabelFont,
        this.cellLabelColor,
        this.headerFont,
        this.fontColor
    ];
}

class AxisSettingsCard extends FormattingSettingsCard {
    showAxisTitles = new formattingSettings.ToggleSwitch({
        name: "showAxisTitles",
        displayName: "Show Axis Titles",
        description: "Display titles below column axis (X) and beside row axis (Y)",
        value: false
    });

    xAxisTitle = new formattingSettings.TextInput({
        name: "xAxisTitle",
        displayName: "X Axis Title",
        placeholder: "X axis title",
        value: ""
    });

    yAxisTitle = new formattingSettings.TextInput({
        name: "yAxisTitle",
        displayName: "Y Axis Title",
        placeholder: "Y axis title",
        value: ""
    });

    name: string = "axisSettings";
    displayName: string = "Axis Titles";
    slices: Array<FormattingSettingsSlice> = [
        this.showAxisTitles,
        this.xAxisTitle,
        this.yAxisTitle
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    cardSignature = new CardSignatureSettings();
    heatmapSettings = new HeatmapSettingsCard();
    columnSettings = new ColumnSettingsCard();
    labelSettings = new LabelSettingsCard();
    axisSettings = new AxisSettingsCard();
    titleSettings = new TitleSettings();
    background = new BackgroundSettings();
    visualBorder = new BorderSettings();

    constructor() {
        super();
        // D-06 default-preservation override (per-visual instance only —
        // _shared/formatting/backgroundSettings.ts itself is untouched,
        // D-11): pbiHeatmapMatrix's PRE-EXISTING default was "no background
        // ever painted" — confirmed via direct inspection of src/visual.ts:
        // `this.container` (the outer scrollable render root appended to
        // options.element) never has a background-color set anywhere;
        // only cell-level colours (heatmapSettings.*Color) are painted, on
        // a distinct DOM layer (each <td>), never the container. The
        // frozen shared Background card's own default (opaque white,
        // transparency 0) would regress every old saved report to a
        // suddenly-opaque white container. Overriding the TRANSPARENCY
        // default to 100 makes toRgba(...) resolve to alpha 0 regardless
        // of colour — pixel-identical to "nothing painted".
        this.background.transparency.value = 100;
    }

    cards = [this.titleSettings, this.heatmapSettings, this.columnSettings, this.labelSettings, this.axisSettings, this.background,
        this.cardSignature, this.visualBorder
    ];
}
