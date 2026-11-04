# Lakbay Itinerary Creator

Lakbay is a private, browser-based travel planner for organizing multiple trips, day-by-day stops, flights, hotels, food shortlists, daily expense logs, and packing checklists. Everything stays in your browser using `localStorage`; there is no account, backend, cloud sync, or build step.

The collapsible trip navigation keeps each planning area together. Food is organized by the same days as Itinerary, with Breakfast, Lunch, Snacks, Dinner, and Other sections. You can add multiple timed visits per section from either tab, and scheduled meals also appear in the Itinerary timeline. Saved places remain in the Food shortlist for reuse. Costs entered for flights, hotels, and dated food visits are automatically linked to the matching trip day's Expenses entry.

Meal cards in Itinerary and Food show the meal type in brackets, a parenthesized duration, and a two-line notes preview when collapsed. Expand a meal to edit its full notes, start time, and duration (15, 30, 45, or 60 minutes; default 30). Duration does not affect schedule ordering or Travel Day's Next Stop selection. Durations are saved with the trip and included in JSON backups.

## Run locally

Open `index.html` in any modern browser. No installation or local server is required.

## Deploy to GitHub Pages

The included `.github/workflows/deploy-pages.yml` workflow publishes the static app whenever changes are pushed to `main`. It can also be started manually from the repository's **Actions** tab. During deployment, it injects the Gemini key from the `TRAVELBOT_API` Actions secret into a staged copy of the site; the committed source retains a safe placeholder.

For the first deployment:

1. Push the repository to GitHub.
2. Open **Settings → Pages** in the GitHub repository.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Under **Settings → Secrets and variables → Actions**, create a repository secret named `TRAVELBOT_API` containing the Gemini API key.
5. Push to `main`, or run **Deploy Lakbay to GitHub Pages** from the **Actions** tab.
6. When the workflow finishes, use the Pages URL shown in the deployment job or in **Settings → Pages**.

Trip information is not uploaded to GitHub or included in the deployment artifact. The published app saves data under `itineraryApp:v1` in the visitor's browser `localStorage`. Data is therefore specific to that browser, device, and GitHub Pages address; clearing site data removes it, and a different browser starts with an empty planner.

## Compact day workspace and location preview

Itinerary and Food show one selected day in a shared workspace layout. On desktop, Day cards sit on the left and the selected day's details scroll inside a fixed-height pane on the right. Each side scrolls independently for longer trips. On phones and tablets up to 900px wide, the Day cards form a horizontal row pinned below section navigation, and content uses normal page scrolling. Short desktop screens also use page scrolling to keep controls reachable.

Activities, tours, and meals start as compact summaries. Click or keyboard-activate a summary to expand it; opening another card closes the previous one. Switching days closes every card and returns to the start of that day's details. Itinerary and Food share the selected day during the page session, with a separate remembered selection for each trip. Reloading starts at the first day. The existing Day 0 numbering stays unchanged.

Expanded cards contain their details, editing controls, and inline location map. Tours provide a location selector and display one stop at a time. With no configured map key or usable location, the card shows guidance and offers an external map link when possible. Food retains its external venue links, grouped meals, unscheduled visits, and a collapsed Saved places library. Use only the grip at the far-right edge to drag activities/tours within their current day. Links and editor controls keep their normal actions. Day selection and expansion are temporary UI state and are not written into trip backups.

The preview uses Google Maps Embed API place mode and the existing activity or selected tour location. Meals use their own Location first, then their linked saved place (or a unique matching saved venue). A venue-only scheduled meal uses the most recent timed activity/tour location that day, or the first upcoming location if none precedes it, as a `near` search anchor. After a tour ends, its final destination becomes the anchor. With no usable times, a single distinct day location can anchor the search. No day-level city/country settings, overall trip destination, or device location are used. Ambiguous venue-only meals without a usable root show a location prompt instead of sending an unqualified search. Google chooses the final result, so an exact meal/saved-place Location remains the best source for a specific branch. Food links, Travel Day maps, and the inline preview use the same resolver. No Places API or geocoding service is added. Existing legacy mapCity/mapCountry metadata is preserved in backups but ignored. [Maps Embed setup](https://developers.google.com/maps/documentation/embed/get-api-key).

To enable live previews, enable Maps Embed API in a Google Cloud project and create a key restricted to **Websites** (`https://chaddeguzman.github.io/*`) and **Maps Embed API** only. Store it as the repository Actions secret `MAPS_EMBED_API_KEY`, then run the Pages deployment. The workflow injects it into the staged `scripts/maps-config.js`; committed source retains a placeholder. Browser keys are visible to visitors, so apply those restrictions. Without a configured key, the preview still identifies the selected place and offers its Google Maps link. Google may display its own errors inside the cross-origin iframe; the external link remains available.

Local checkout previews retain the placeholder by default. For an isolated local test copy, inject a key restricted to an approved localhost URL into that copy; do not commit a key or relax the production key's restrictions.

Inline maps fit their expanded card, up to a 400px square. Collapsing the card removes its map. Travel Day remains available above the selected itinerary. PDF and JSON export include the complete trip regardless of the selected day or expansion state; browser printing from Itinerary also includes every day and its details.

## TravelBot placement

TravelBot starts at the bottom-right of the viewport with 24px margins on wide screens and 16px on screens up to 900px wide, plus device safe-area insets. It follows viewport resizing until manually moved. Mouse and touch dragging remain available; manual placement survives trip re-renders and is clamped inside the viewport after resizing. Opening chat keeps the mascot stationary.

## Back up and move your data

Trip data is tied to the browser and device where it was created. Open **Manage Data** and use **Export** to save all trips as a JSON file. On another device, open Lakbay and choose **Import**, then select that JSON file; importing replaces the data currently stored in that browser.

The JSON file is the app's cross-device transfer method. Keep copies somewhere safe because clearing browser storage can remove the working data.

## Exports

- **Export PDF** downloads the current trip as a paginated PDF with its days, activities, tours, and meals. Pages are images so text is not selectable; use the JSON export for editable data.
- **Manage Data → Export** exports editable JSON data for later restoration.

## Gemini module and API-key safety

`gemini_travel_api.js` powers the floating Lakbay TravelBot and exposes its reusable browser API as `window.GeminiApi`. The assistant uses the active itinerary as planning context while excluding booking references.

**Never commit a real Gemini API key to the repository.** Keep `API_KEY` set to `'__TRAVELBOT_API__'`; the Pages workflow replaces it only inside the staged deployment artifact using the `TRAVELBOT_API` Actions secret. Because this remains a browser-side integration, visitors can inspect the deployed key. Restrict the key to the Gemini API and the Lakbay Pages domain in Google Cloud. A server-side proxy is required if the key must remain fully private.

## Project structure

```text
index.html                         Application markup and file references
css/styles.css                     Application and print styles
scripts/app.js                     Itinerary logic and localStorage persistence
gemini_travel_api.js               Gemini API client and TravelBot controller
.github/scripts/                   Deployment-only secret injection helpers
.github/workflows/deploy-pages.yml GitHub Pages staging and deployment workflow
README.md                          Setup, transfer, and safety notes
assets/                            Static assets and future screenshots
```
