# Design Scrapper: ideas for the current design

Status: proposed. Revised 2026-10-27 using zero-slop-design `define-design` after the user supplied the current Eagle screenshot.

## Brief and reference

Audience, inferred from the project: designers collecting UI inspiration in Eagle. Primary task: manage sources, run imports, and confirm daily collection is working.

The user's screenshot, “T3 Code (Nightly) at 10 -27 - 16.45.07@2x.jpg,” is the visual baseline. It matches the current styling in `index.html`, `css/app.css`, and `js/ui.js` inspected on this date. The previous concept moved too far from that design. This revision preserves its components and hierarchy.

The [comparison](design-concept.html) uses the existing stylesheet and screenshot-derived sample text. Current layout and Small refinements are illustrative, not connected to Eagle. Native window chrome is omitted; this is not a pixel-perfect screenshot reproduction.

## Existing selections to preserve

- Charcoal surfaces, rounded cards, lavender gradient primary button, light segmented thumb, and the existing typography.
- New / 3d / 7d / 14d / 30d / All and Run all now in the header.
- Source identity on the left, daily-run toggles on the right, and the inline source form.
- Source filter, dated timeline, colored source dots, and right-aligned import times.
- Existing progress, retry, stopping, undo, confirmation, and Eagle theme integration in the code. These states are not shown in the screenshot.

No replacement dropdown, new app icon, or replacement feed layout is proposed.

## Proposed improvements, in priority order

### 1. Make essential secondary text easier to read

The screenshot's subtitle, source count, placeholder, and timestamps are subdued. Several use `--faint` in `css/app.css`. Raise these to a stronger secondary text color; keep rails and borders subdued. Preserve uppercase section labels and the existing hierarchy. Runtime contrast remains unmeasured.

### 2. Replace the query string with an Interface label

The screenshot shows `recent.design?category=interface`. `renderSources` in `js/ui.js` appends raw path and query text after the host. Show recent.design plus a small Interface label for this recognized filter; retain the complete URL in the source tooltip. Keep meaningful paths for unfamiliar URLs and do not change the stored URL or adapter behavior.

### 3. Explain New while retaining the segmented picker

Keep all six choices and the sliding thumb. The buttons already have full-label tooltips (`buildRange` in `js/ui.js`); add a brief visible explanation of the selected range. Add arrow-key selection and a single tab stop. Preserve the historical-import confirmation and distinguish manual ranges from the daily schedule. Keep the first-run lookback and overlapping fetch window unchanged.

### 4. Give counts an explicit unit

The screenshot shows 0 new, 4 new, and 5 new. `status.lastImported` counts files, whereas activity records designs with their file count (`importPlan` in `js/runner.js`). Keep the compact metadata line, using No new files or 4 files added. Retain last-run and next-run information without implying a more precise schedule than the hourly check permits.

### 5. Make current row actions keyboard-accessible

Source Run actions already appear on hover/focus. Selection lacks equivalent visible focus treatment, the filter's Only control is hover-only, and import entries are clickable divs (`css/app.css`, `js/ui.js`). Preserve quiet default rows; reveal actions on row `:focus-within`, name selection controls by source, and use keyboard-operable buttons styled like the current timeline entries. Contain modal focus and restore it on close.

## Later feature idea

Optionally add small thumbnails beside existing timeline titles, retaining date rails, source dots, and a text-only preference. Verify Eagle's thumbnail API and retrieval cost first; current activity stores an item ID and file count, not thumbnails. This feature is not shown in the revised comparison.

## Suggested first pass

Start with secondary text, the Interface label, range help, and explicit count units. These refine the screenshot's design without replacing its components. Address keyboard behavior within the same components.

## Constraints and unresolved items

- Keep plain HTML/CSS/CommonJS, no build step, Chromium 107, and Node 16 as required by AGENTS.md.
- Keep adapters, scheduling, deduplication, ranges, and the Uncategorized destination.
- Preserve lavender gradients and the existing shape language.
- The screenshot shows a dark idle state. Light mode, narrow windows, keyboard operation, other states, and exact runtime contrast remain unverified.
- The comparison uses current source CSS and screenshot-derived sample data. Its line wraps depend on preview width; they are not measurements of the Eagle window.

## Work and checks

The installed zero-slop-design v0.2.1 bundle remains unchanged. Revised this brief and the standalone comparison; application files are unchanged. The comparison is inspected with the HTML preview renderer. No Eagle integration or application tests were run. This advisory brief is not a token-bearing DESIGN.md, so its document linter is not applicable.
