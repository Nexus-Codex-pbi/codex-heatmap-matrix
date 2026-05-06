# User Guide – Codex Heatmap Matrix

## Overview
Colour-coded heatmap grid for two-dimensional data analysis with flexible colour schemes. Displays the intersection of row and column categories with cell values represented by colour intensity.

## 1. Adding the Visual
1. Import the `.pbiviz` file into Power BI Desktop
2. Locate the visual in the Visualizations pane
3. Drag it onto the report canvas

## 2. Data Binding
- **Row Category** (Required): Row axis category (e.g. Beat, Region, Product). Each unique value creates a row.
- **Column Category** (Required): Column axis category (e.g. Day of Week, Month, Shift). Each unique value creates a column.
- **Cell Value** (Required): Numeric value displayed in each cell (e.g. sales amount, count).
- **Sort Order** (Optional): Numeric value to control row sort order (ascending). If bound, rows are sorted by this value.

## 3. Formatting Options
**Heatmap Settings**
- Color Scheme: Predefined schemes: Green to Red, Red to Green, Sequential, or Custom.
- Low Color: Colour for low values (used in Custom scheme).
- Mid Color: Colour for mid values (used in Custom scheme).
- High Color: Colour for high values (used in Custom scheme).
- Zero Color: Colour for zero values.
- Cell Border Radius: Radius of cell corners (px).
- Show Values: Toggle display of numeric values inside cells.
- Value Format: Number or Percent (applies when Show Values is on).
- Decimal Places: Number of decimal places for displayed values.

**Column Settings**
- Column Order: Auto (alphabetical) or Weekday (sorts columns as Sun, Mon, Tue, Wed, Thu, Fri, Sat).

**Label Settings**
- Font Size: Size of row and column labels.
- Header Font Size: Size of headers (if axis titles shown).
- Font Color: Colour of the text.

**Axis Settings**
- Show Axis Titles: Toggle visibility of axis titles.
- X Axis Title: Title for the column axis.
- Y Axis Title: Title for the row axis.

**Visual Title** (standard)
- Show Title, Title Text, Font Family, Font Size, Bold, Italic, Underline, Alignment, Font Color.

## 4. Features
- Two-dimensional grid showing the relationship between row and column categories.
- Colour intensity represents the cell value relative to the min/max in the data.
- Tooltips on hover showing row, column, and value.
- Click a cell to cross-filter other visuals by that row and column combination.
- Right-click for context menu.
- Supports high contrast mode and keyboard navigation.
- Configurable colour schemes (including custom low/mid/high).
- Optional display of numeric values in cells.
- Weekday column ordering for time-based columns.
- Responsive layout with scrollbars when grid exceeds container size.
- Supports sorting rows by the Sort Order field.

## 5. Limitations
- Only the first 30,000 unique row and column combinations are processed (data reduction limit).
- Requires Cell Value to be numeric; non-numeric values are treated as zero.
- If Cell Value is not bound, the visual shows empty cells.
- The visual does not support drill-through or hierarchical categories.
- Column Order weekday sorting expects column values to be day names (e.g., Monday, Mon, etc.).
- Sort Order must be numeric; non-numeric values are placed at the end.

## 6. Support
For help or questions, visit https://nexuscodex.nexus/support