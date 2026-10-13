# Pending upgrades

## Separate personal-record export

Status: implemented for version 2.9.0 on October 12, 2026; requested October 11, 2026.

Add a separate export button for the highest successfully recorded lift for every exercise across saved workouts and the active session.

- Export each exercise's highest logged weight together with the repetitions actually completed at that weight. If multiple sets share the highest weight, select the one with the most completed reps and include its date.
- Include all recorded strength exercises, independently of the current session's exercise list. Keep the normal next-workout export unchanged.
- Use completed lifts, excluding failed attempts and sets marked stopped for pain or unsafe form. Do not silently substitute estimated 1RM values for recorded lifts.
- Clearly label entries as logged records; label a tested/measured maximum only when the app has explicit supporting information.
- Include known weight conventions/equipment names to distinguish machine and per-hand records. Missing optional information must not prevent export.
- Produce a concise, AI-readable list with exercise, weight, reps, date, and equipment context when available. Provide copy and download behavior consistent with existing exports.

Verification when implemented: preserve real weight–rep pairs, handle tied records, exclude failures, retain different known equipment contexts, include saved and active data, and leave the current-session roster rule intact for the normal export.
