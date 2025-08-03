# Workout Tracker

This is a lightweight web-based workout tracker. Log sets with any weight (including zero for bodyweight exercises) and export data as JSON or CSV.

### History

Workout history is saved to local storage under `wt_history`. You can export this history to a JSON file or import it back in two ways:

1. **Import History** – choose a JSON file from disk.
2. **Paste History** – toggle the paste box and paste JSON directly.

After pasting valid JSON the calendar re-renders and you'll see your notes immediately.

Run tests with `npm test`.
