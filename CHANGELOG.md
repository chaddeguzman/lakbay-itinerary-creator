# Changelog

## Unreleased - 2026-07-22

- Fixed HTML escaping for double quotes in rendered itinerary text.
- Preserved unreadable saved itinerary data under `itineraryApp:v1:corrupt-backup` before resetting to a blank state.
- Added a recovery toast when saved data cannot be read.
- Improved dialog labelling and dynamic chat message language metadata.
- Kept the Lakbay chat bubble anchored from the lower-right corner on page load.
- Split the main app script into native ES modules for state, panels, actions, and exports.
- Added trip countdown/status messaging and a next-up highlight for today's itinerary.
