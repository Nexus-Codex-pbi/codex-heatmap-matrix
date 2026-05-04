"use strict";

import powerbi from "powerbi-visuals-api";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const ConstantOrRule = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;

class HeatmapSettingsCard extends FormattingSettingsCard {
    colorScheme = new formattingSettings.ItemDropdown({
        name: "colorScheme",
        displayName: "Colour Scheme",
        items: [
            { displayName: "Green to Red", value: "greenToRed" },
            { displayName: "Red to Green", value: "redToGreen" },
            { displayName: "Sequential", value: "sequential" },
            { displayName: "Custom", value: "custom" }
        ],
        value: { displayName: "Green to Red", value: "greenToRed" }
    });

    lowColor = new formattingSettings.ColorPicker({
        name: "lowColor",
        displayName: "Low Colour",
        description: "Colour for the lowest value (used in Custom scheme)",
        value: { value: "#e0f5ef" },
        instanceKind: ConstantOrRule
    });

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

    name: string = "heatmapSettings";
    displayName: string = "Heatmap";
    slices: Array<FormattingSettingsSlice> = [
        this.colorScheme,
        this.lowColor,
        this.midColor,
        this.highColor,
        this.zeroColor,
        this.cellBorderRadius,
        this.showValues,
        this.valueFormat,
        this.decimalPlaces
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
    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Cell Font Size",
        description: "Font size for cell values (px)",
        value: 12
    });

    headerFontSize = new formattingSettings.NumUpDown({
        name: "headerFontSize",
        displayName: "Header Font Size",
        description: "Font size for column/row headers (px)",
        value: 11
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
        this.fontSize,
        this.headerFontSize,
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

class TitleSettingsCard extends FormattingSettingsCard {
    showTitle = new formattingSettings.ToggleSwitch({
        name: "showTitle",
        displayName: "Show Title",
        value: false
    });

    titleText = new formattingSettings.TextInput({
        name: "titleText",
        displayName: "Title Text",
        placeholder: "Visual title",
        value: ""
    });

    titleFontFamily = new formattingSettings.FontPicker({
        name: "titleFontFamily",
        displayName: "Font Family",
        value: "Segoe UI, sans-serif"
    });

    titleFontSize = new formattingSettings.NumUpDown({
        name: "titleFontSize",
        displayName: "Font Size",
        value: 14
    });

    titleBold = new formattingSettings.ToggleSwitch({
        name: "titleBold",
        displayName: "Bold",
        value: true
    });

    titleItalic = new formattingSettings.ToggleSwitch({
        name: "titleItalic",
        displayName: "Italic",
        value: false
    });

    titleUnderline = new formattingSettings.ToggleSwitch({
        name: "titleUnderline",
        displayName: "Underline",
        value: false
    });

    titleFont = new formattingSettings.FontControl({
        name: "titleFont",
        displayName: "Font",
        fontFamily: this.titleFontFamily,
        fontSize: this.titleFontSize,
        bold: this.titleBold,
        italic: this.titleItalic,
        underline: this.titleUnderline
    });

    titleAlign = new formattingSettings.AlignmentGroup({
        name: "titleAlign",
        displayName: "Alignment",
        mode: powerbi.visuals.AlignmentGroupMode.Horizonal,
        value: "left"
    });

    titleColor = new formattingSettings.ColorPicker({
        name: "titleColor",
        displayName: "Font Color",
        value: { value: "#1a1a2e" },
        instanceKind: ConstantOrRule
    });

    name: string = "titleSettings";
    displayName: string = "Visual Title";
    slices: Array<FormattingSettingsSlice> = [
        this.showTitle,
        this.titleText,
        this.titleFont,
        this.titleAlign,
        this.titleColor
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    heatmapSettings = new HeatmapSettingsCard();
    columnSettings = new ColumnSettingsCard();
    labelSettings = new LabelSettingsCard();
    axisSettings = new AxisSettingsCard();
    titleSettings = new TitleSettingsCard();

    cards = [this.titleSettings, this.heatmapSettings, this.columnSettings, this.labelSettings, this.axisSettings];
}
