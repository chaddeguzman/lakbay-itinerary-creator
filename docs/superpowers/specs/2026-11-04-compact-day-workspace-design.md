# Compact Itinerary and Food day workspace

Status: design approved in chat on 2026-11-04; implementation not authorized by this document.

## Intent and scope

Make Itinerary and Food easier to browse with one selected day and compact content cards inside one shared workspace layout. Preserve the current theme, trip records, and planning capabilities. Other tabs and Travel Day retain their behavior.

## Approved behavior

- Both tabs use Day cards to select the details displayed.
- Desktop: one fixed-height container, vertical Day cards on the left, selected-day details on the right with internal scrolling. The day list scrolls independently when needed.
- Phone: a horizontal Day-card row pinned beneath the app header/navigation, followed by one portrait column of content with normal page scrolling. No fixed-height details pane on phones.
- Activity, tour, and meal cards start as compact summaries. Tapping a summary expands its details; tapping it again collapses it.
- At most one content card is expanded in the active workspace.
- Opening another card closes the previous card and its embedded map.
- Switching days closes all cards and resets the details scroll to its start.
- Maps live inside expanded cards, replacing the shared itinerary preview panel.
- Selected day is synchronized between Itinerary and Food; initially select the first day.
- Summaries show time, activity/tour name or meal venue, relevant duration, and existing status indicators.
- Editing controls appear inside expanded cards; links, controls, and drag handles retain their own actions.
- Food's saved-place library remains accessible through a collapsed section.
- Preserve shared meal records, tour-location selection, Travel Day, and complete-trip exports.

## Approaches

Use a shared selected-day shell and shared expansion state, while retaining each tab's own content rendering. This directly follows the chosen two-pane layout and avoids divergent selection behavior between tabs.

Keeping every day as an accordion would retain the long page the user wants to replace. Separate day pages would introduce navigation the user did not request. Neither is part of the approved design.

## Implementation decisions delegated to the builder

- Use existing plain JavaScript modules and CSS; add no framework, package, or service.
- Keep selected-day preferences in a runtime Map keyed by trip ID; selection survives tab/trip navigation during this page session. Reload persistence is not required.
- Keep expansion transient and scoped to the current tab/day; changing tabs closes the old card while keeping the day selected.
- Preserve existing Day numbering, including Day 0. Do not renumber stored trips or change dates.
- Use the existing responsive navigation boundary (900px, verified during implementation) for the phone-style layout; short landscape viewports may also use normal page scrolling to retain usable space.
- Desktop container targets the available viewport height: subtract measured/styled app chrome and a small bottom margin from 100dvh. No arbitrary height that clips controls on short screens.
- Use roughly 160-200px for the desktop day rail; allow the details column to shrink with min-width: 0. Verify actual values visually before finalizing.
- Day cards show number, date, and truncated short title with the full title accessible. Keep day-title editing in the selected-day header.
- Use native buttons for day selection and accessible disclosure semantics for card expansion. Avoid nesting interactive controls inside a disclosure button.
- Keep add-entry actions reachable in the selected day. Creating an entry opens its editor; an empty day remains usable.
- Keep Food meal groups, unscheduled visits, and saved places available. Auxiliary sections do not count as activity/tour/meal expansion; their meal cards still obey the one-card rule.
- Commit existing input/time drafts before navigation or expansion changes; preserve current save/cancel semantics rather than discarding edits.
- Preserve existing map resolver behavior and missing-key/location prompts. Create a lazy iframe only for the expanded card and remove it on collapse. Map selector changes must preserve the open card, focus, and scroll.
- Preserve the external venue links in Food and right-edge activity/tour drag handles. Dragging remains within the current day.
- Print all itinerary days and details, irrespective of selected day or expansion. PDF/JSON exports continue to consume the complete trip data.

## Success criteria

The approved layouts work with pointer and keyboard input, long trips and titles, empty days, both themes, touch scrolling, and short screens. Switching days never leaves stale map content or an unreachable selection. Editing, adding, deleting, meal scheduling, drag ordering, Travel Day, exports, and TravelBot remain usable. Existing saved data loads without migration or record loss.

## Delivery boundary

This phase produces a design and implementation plan only. Product implementation, Git publication, merge, and deployment require a subsequent execution instruction. During execution, review current repository guidance and use the registered Second Self commit workflow when authorized, as required by the user's instructions for public repositories under chaddeguzman.
