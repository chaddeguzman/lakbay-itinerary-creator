# Lakbay Itinerary Creator

Lakbay is a private, browser-based travel planner for organizing multiple trips, day-by-day stops, flights, hotels, food shortlists, daily expense logs, and packing checklists. Everything stays in your browser using `localStorage`; there is no account, backend, cloud sync, or build step.

The collapsible trip navigation keeps each planning area together. Costs entered for flights, hotels, and dated food plans are automatically linked to the matching trip day's Expenses entry.

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

## Back up and move your data

Trip data is tied to the browser and device where it was created. Open **Manage Data** and use **Export** to save all trips as a JSON file. On another device, open Lakbay and choose **Import**, then select that JSON file; importing replaces the data currently stored in that browser.

The JSON file is the app's cross-device transfer method. Keep copies somewhere safe because clearing browser storage can remove the working data.

## Exports

- **Export PNG** renders the current trip to a downloadable image using the browser Canvas API.
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
