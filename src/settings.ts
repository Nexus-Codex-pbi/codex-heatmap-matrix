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

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    heatmapSettings = new HeatmapSettingsCard();
    columnSettings = new ColumnSettingsCard();
    labelSettings = new LabelSettingsCard();
    axisSettings = new AxisSettingsCard();

    cards = [this.heatmapSettings, this.columnSettings, this.labelSettings, this.axisSettings];
}
