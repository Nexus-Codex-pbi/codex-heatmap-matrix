# Codex Heatmap Matrix

## Overview
A matrix visual that displays data as a grid of colored cells, where color intensity represents the value magnitude. Ideal for spotting patterns across two categorical dimensions.

## Features
- Displays data in a grid with rows and columns defined by two category fields
- Cell background color scales with the numeric value (configurable color schemes)
- Displays numeric values inside cells (optional)
- Context menu (right-click) for cross-filtering and other interactions
- Tooltip on hover showing row, column, and value
- Click a cell to cross-filter other visuals by that row and column combination
- Supports keyboard navigation and screen readers
- High contrast mode support
- Responsive layout with scrollbars when content exceeds container size
- Configurable cell border radius
- Optional column ordering (auto or weekday)
- Supports empty state and landing page

## Data Roles
| Role | Display Name | Kind | Required? | Data Type | Description |
|------|--------------|------|-----------|-----------|-------------|
| rowCategory | Row Category | Grouping | No (max 1) | Text or Grouping | Row axis category (e.g. Beat, Region, Product) |
| columnCategory | Column Category | Grouping | No (max 1) | Text or Grouping | Column axis category (e.g. Day of Week, Month, Shift) |
| cellValue | Cell Value | Measure | No (max 1) | Numeric | Numeric value displayed in each cell |
| sortOrder | Sort Order | Measure | No (max 1) | Numeric | Optional numeric value to control row sort order (ascending) |

Note: Each role can have at most one field bound. At least rowCategory, columnCategory, and cellValue are required for meaningful display.

## Formatting Options
The visual provides the following format pane cards:

### Heatmap Settings
- Color Scheme: Green to Red, Red to Green, Sequential, or Custom
- Low Color: Color for low values (used in custom scheme)
- Mid Color: Color for mid values (used in custom scheme)
- High Color: Color for high values (used in custom scheme)
- Zero Color: Color for zero values
- Cell Border Radius: Radius of cell corners in pixels
- Show Values: Toggle visibility of numeric values inside cells
- Value Format: Number or Percent (controls how cell values are formatted)
- Decimal Places: Number of decimal places to display (0-6)

### Column Settings
- Column Order: Auto (alphabetical) or Weekday (sorts days Sunday-Saturday)

### Label Settings
- Font Size: Font size for row and column labels in pixels
- Header Font Size: Font size for headers in pixels
- Font Color: Text color for labels and headers

### Axis Settings
- Show Axis Titles: Toggle visibility of axis titles
- X Axis Title: Title for the column axis (horizontal)
- Y Axis Title: Title for the row axis (vertical)

### Title Settings
- Show Title: Toggle visibility of the visual title
- Title Text: Custom title text
- Font Family, Font Size, Bold, Italic, Underline
- Alignment (left, center, right)
- Font Color

## How to Use
1. Import the `.pbiviz` file into Power BI Desktop (from the Visuals pane -> ... -> Import from file).
2. Locate the visual in the Visualizations pane and add it to the report canvas.
3. Bind data to the data roles:
   - Row Category: Field for row groups (e.g., Product)
   - Column Category: Field for column groups (e.g., Month)
   - Cell Value: Numeric measure to display in cells (e.g., Sales Amount)
   - Optional: Sort Order (numeric field to control row order)
4. Use the format pane to adjust appearance:
   - Choose color scheme and set custom colors if needed
   - Adjust cell border radius, value display, and formatting
   - Configure labels, fonts, and axis titles
5. Interact:
   - Click a cell to cross-filter other visuals by that row and column
   - Right-click for the context menu
   - Hover to see a tooltip with row, column, and value

## Limitations
- The visual expects numeric values for Cell Value. Non-numeric values are treated as zero.
- Each data role accepts only one field.
- The visual uses a data reduction algorithm (top 30,000 rows) which may limit the number of unique row/column combinations displayed.
- When Show Values is enabled, very small cells may not display the numeric value due to space constraints.
- The visual does not support drill-through or hierarchical axes.
- In Weekday column order, only recognized day names (e.g., Mon, Monday) are sorted; others fall back to auto order.

## Support
For help or questions, visit https://nexuscodex.nexus/support