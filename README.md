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

## Itinerary location preview

Select an activity, tour, or meal card in Itinerary to preview its location in one shared map. Click its time, duration, title, location, or notes to select it. Use only the grip at the far-right edge to drag and reorder the card within its day. Editor controls keep their normal behavior. Clicking an already-selected card does not reload the map or reset its chosen tour stop. On wide screens the map stays on the right; narrower screens place it above the list. Tours provide a location selector and display one stop at a time. Meal names select the preview using the entered venue; use Open in Google Maps in the preview for an external map. Meals without a venue show a prompt. The separate Food tab retains its external venue links, and the Maps tab continues to work. Selection is temporary UI state and is not written into trip backups.

The preview uses only Google Maps Embed API place mode, with the entered venue/location plus the city and country saved for its day. Set both fields under **Map location for this day** in Itinerary or Food. Existing and newly added days start blank; Lakbay does not infer their location from the trip title, destination, device location, or visitor country. Until both fields are set, the shared map shows a prompt and does not send an unqualified map search. For a cross-border stop or meal, set both fields in its **Map location override**; clear both to return to the day location. Partial overrides do not mix with the day fields. These fields are saved locally and included in JSON backups. Food links, Travel Day maps, and day routes use the same context. It does not use Places Text Search or Place Photos. Google currently lists Embed usage as free, but requires an API key and billing setup: [Maps Embed setup](https://developers.google.com/maps/documentation/embed/get-api-key).

To enable live previews, enable Maps Embed API in a Google Cloud project and create a key restricted to **Websites** (`https://chaddeguzman.github.io/*`) and **Maps Embed API** only. Store it as the repository Actions secret `MAPS_EMBED_API_KEY`, then run the Pages deployment. The workflow injects it into the staged `scripts/maps-config.js`; committed source retains a placeholder. Browser keys are visible to visitors, so apply those restrictions. Without a configured key, the preview still identifies the selected place and offers its Google Maps link. Google may display its own errors inside the cross-origin iframe; the external link remains available.

Local checkout previews retain the placeholder by default. For an isolated local test copy, inject a key restricted to an approved localhost URL into that copy; do not commit a key or relax the production key's restrictions.

The map and Travel Day stay aligned at the top while scrolling the itinerary. With enough room, the map retains its 400px square view in the right column. Narrower layouts place a compact map at the far right of the Travel Day row: up to 260px on tablets and 200px on phones, shrinking further when necessary. The row stays below mobile navigation. On short screens, the map panel scrolls internally so its selector and links remain reachable.

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
