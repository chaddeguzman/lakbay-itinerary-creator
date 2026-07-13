# Lakbay Itinerary Creator

Lakbay is a private, browser-based travel planner for organizing multiple trips, day-by-day stops, flights, hotels, food shortlists, daily expense logs, and packing checklists. Everything stays in your browser using `localStorage`; there is no account, backend, cloud sync, or build step.

The collapsible trip navigation keeps each planning area together. Costs entered for flights, hotels, and dated food plans are automatically linked to the matching trip day's Expenses entry.

## Run locally

Open `index.html` in any modern browser. No installation or local server is required.

## Deploy to GitHub Pages

The included `.github/workflows/deploy-pages.yml` workflow publishes the static app whenever changes are pushed to `main`. It can also be started manually from the repository's **Actions** tab. There is no build command and no deployment secret to configure.

For the first deployment:

1. Push the repository to GitHub.
2. Open **Settings → Pages** in the GitHub repository.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Push to `main`, or run **Deploy Lakbay to GitHub Pages** from the **Actions** tab.
5. When the workflow finishes, use the Pages URL shown in the deployment job or in **Settings → Pages**.

Trip information is not uploaded to GitHub or included in the deployment artifact. The published app saves data under `itineraryApp:v1` in the visitor's browser `localStorage`. Data is therefore specific to that browser, device, and GitHub Pages address; clearing site data removes it, and a different browser starts with an empty planner.

## Back up and move your data

Trip data is tied to the browser and device where it was created. Use **Download** in the trip menu to save all trips as a JSON file. On another device, open Lakbay and choose **Import**, then select that JSON file; importing replaces the data currently stored in that browser.

The JSON file is the app's cross-device transfer method. Keep copies somewhere safe because clearing browser storage can remove the working data.

## Exports

- **Print / PDF** opens the browser print dialog with a clean itinerary layout; choose “Save as PDF.”
- **Export PNG** renders the current trip to a downloadable image using the browser Canvas API.
- **Download** exports editable data for later restoration, unlike PDF and PNG.

## Gemini module and API-key safety

`gemini_travel_api.js` is present for a future travel-assistant feature, but it is intentionally **not loaded or connected to any UI in this build**. Its browser API is exposed as `window.GeminiApi` if the script is included later.

**Never commit a real Gemini API key to a public repository.** Keep `API_KEY` set to the placeholder `'__CHATBOT_API__'` in every version pushed to GitHub. Only put a real key in a private, local copy that is not tracked by Git. If maintaining a separate local key-bearing module, add that local filename (for example `gemini_travel_api.local.js`) to `.gitignore` and load it only in your private copy. Client-side keys can still be inspected by anyone who can open the published site, so a public deployment ultimately needs a protected server-side proxy before Gemini is enabled.

## Project structure

```text
index.html                         Application markup and file references
css/styles.css                     Application and print styles
scripts/app.js                     Itinerary logic and localStorage persistence
gemini_travel_api.js               Future Gemini integration (not wired in)
.github/workflows/deploy-pages.yml GitHub Pages deployment workflow
README.md                          Setup, transfer, and safety notes
assets/                            Static assets and future screenshots
```
