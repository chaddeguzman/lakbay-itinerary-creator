# Product Requirements Document: Travel Day View

**Status:** Approved for planning  
**Assignment:** Candidate assignment 1 for Charlie  
**Product:** Lakbay Itinerary Creator  
**Date:** 2026-09-28

## Summary

Add a focused Travel Day view that opens from a button in the existing Itinerary section. It appears in a large responsive modal and shows one selected trip day, its schedule, and the next unfinished stop. Travelers can switch among the trip's days, mark scheduled activities, tours, and meals done or undo that status, and open available map links.

The full Itinerary remains the place to edit event details. Completion status remains visible there through crossed-out completed entries and a day-level Completed watermark, but Done controls move to Travel Day.

## Problem

The Itinerary is designed for planning and shows every trip day. During a trip, travelers need a focused view of one day's plan, a clear next stop, and quick completion and map actions without using the event-editing controls in the planning view.

## Goals

- Provide a focused, readable view of one selected trip day.
- Make the current or next unfinished entry easy to identify.
- Support day switching, Done/Undo, and map access from the focused view.
- Preserve completion status and show it in the existing Itinerary.
- Keep trip data local to the browser and compatible with existing saved trips.

## User flow

1. The traveler opens a trip and selects **Open Travel Day** from the Itinerary section.
2. A large responsive modal opens. It is roomy on desktop and nearly full-screen on a phone.
3. The selected day defaults to today when today is part of the trip; otherwise it defaults to the first trip day.
4. The traveler can switch to any day in the selected trip.
5. The view presents that day's scheduled activities, tours, and meals in chronological order, with untimed entries after timed entries, and highlights the Next Stop when one is available.
6. The traveler can mark an activity, tour, or meal done or undo that status. They can open an available map link for a location.
7. Closing the modal returns the traveler to the Itinerary.

## Functional requirements

### Entry point and modal

- Add an **Open Travel Day** button inside the Itinerary section; do not add a new trip-navigation tab.
- Use a large responsive modal. On narrow screens it should use nearly the full available viewport.
- Provide an accessible title and close action. Closing the modal returns to the underlying Itinerary.
- The modal supports day switching without changing or editing event details.

### Schedule and day selection

- Show one selected day at a time.
- Include all scheduled activities, tours, and meals associated with that trip day.
- Sort timed entries by start time and place untimed entries after timed entries. Preserve stable order for entries with matching times.
- Default to today's trip day if its date is within the trip. Otherwise default to the first trip day.
- Allow selection of any day in the trip, including past and future days.
- When the traveler switches trips and opens Travel Day, calculate the default for the newly selected trip using the same rule.

### Next Stop selection

- A completed entry is never selected as Next Stop.
- When the selected day is today:
  - Select the currently active timed entry, if any; otherwise select the earliest unfinished timed entry that has not passed.
  - Timed meals are eligible alongside activities and tours.
  - If no timed entry remains, select the first unfinished untimed entry in schedule order.
- When the selected day is not today, select the earliest unfinished entry in that day's schedule order, regardless of its scheduled time.
- If every scheduled entry is done, show a clear day-complete state and no Next Stop.
- If unfinished entries exist but no Next Stop is available for today because all timed entries have passed and no untimed entries remain, show a clear no-upcoming-stops state. Keep the full schedule visible so the traveler can still update completion.
- If the selected day has no scheduled entries, show a clear empty-day state.

### Completion controls and status

- Provide Done/Undo controls in Travel Day for activities, tours, and scheduled meals.
- Do not provide Done/Undo controls for activities or tours in Itinerary cards. Completion can be changed from Travel Day after switching to the relevant trip day.
- Persist completion status with the existing trip data in browser storage.
- Existing activity and tour completion status must be preserved.
- Treat existing meal records without a completion value as not done; do not discard or rewrite their other data.
- Show completed entries with the existing crossed-out treatment in both Travel Day and Itinerary. Apply the same completion treatment to meals when they are marked done.
- Show the Itinerary's Completed watermark only when the day has at least one scheduled entry and every scheduled activity, tour, and meal is done.
- Unscheduled meal records and saved Food shortlist places do not count toward the day completion watermark.

### Map links

- Provide an external map link when an activity, tour stop, or meal has a usable location.
- Reuse Lakbay's existing map-link behavior and open external links safely in a new tab.
- Do not show a nonfunctional map action when no location is available.

## Non-goals

- Editing titles, dates, times, locations, notes, or other event details from Travel Day.
- Adding or removing scheduled entries from Travel Day.
- Showing weather, flights, hotels, expenses, or packing information in this view.
- Adding live travel-time estimates or buffer warnings; those belong to the separate travel-time-buffers assignment.
- Adding accounts, cloud sync, collaboration, or server storage.
- Replacing or removing the full Itinerary planning view.

## Data and compatibility constraints

- Lakbay is a client-side app that stores trip data in browser `localStorage` under its current itinerary storage key.
- Keep the existing trip data shape compatible. Add only the completion state needed for scheduled meal records, defaulting old records to not done.
- Do not include new network dependencies for the modal, schedule, completion, or map-link behavior.
- Completion changes must survive a page reload and remain consistent between Travel Day and Itinerary.

## Acceptance criteria

1. A traveler can open Travel Day from a button in Itinerary and close it to return to the Itinerary.
2. The modal is usable on desktop and narrow mobile screens, and its title, day controls, close action, schedule, and completion controls are accessible by keyboard and assistive technology.
3. Opening the view selects today when today is within the trip and otherwise selects the first trip day.
4. The traveler can select any trip day and sees only that day's scheduled entries.
5. Activities, tours, and meals appear in chronological order, with untimed entries after timed entries.
6. Next Stop follows the today/non-today rules above, includes timed meals, and excludes completed entries.
7. The traveler can mark activities, tours, and meals done or undo them from Travel Day; those changes persist after reload.
8. Itinerary activity and tour cards no longer expose Done/Undo controls, while completion styling remains visible. Meal completion styling is also visible in Itinerary.
9. The Completed watermark appears only when every scheduled activity, tour, and meal for a non-empty day is done.
10. Map links are available for entries with locations and absent when locations are missing.
11. Existing trips load without data loss; old meal records begin as not done, and existing activity/tour completion states remain unchanged.

## Open implementation choices

- The exact day-switching control (date picker, day buttons, or previous/next controls) can be selected during implementation as long as every trip day is accessible and the selected day is clear.
- The exact responsive dimensions and visual styling should follow Lakbay's existing design tokens and be checked at desktop and mobile widths.

## Evidence checked

- `scripts/render-panels.js`: current itinerary schedule, Next Up selection, map links, meal cards, completion controls, and day-completion watermark.
- `scripts/meals.js`: shared chronological ordering of scheduled activities, tours, and meals, with untimed entries last.
- `scripts/state.js`: localStorage-backed trip persistence and normalization of existing activity/tour completion data.
- `index.html` and `scripts/app.js`: existing native-dialog markup and modal-opening pattern.
