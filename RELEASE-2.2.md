# Workout Tracker 2.2 — research-informed progression follow-through

## What changed

- When a user starts an exercise from **Next up**, the app saves that exercise's assigned warm-up and main-set targets separately from the actual set log. A saved workout and its AI export can therefore distinguish prescribed work, completed work, and omitted sets. Older workouts without assigned targets remain valid and are not retroactively judged against an invented plan.
- The local next-workout planner holds an uncompleted assignment instead of increasing load, adding reps, or silently dropping omitted sets. A time-limited omission is not labeled a strength failure. Changed loads are not automatically counted as completion of the assigned load.
- An optional one-tap straight-set **5×5 strength preset** is available under Advanced AI settings for the selected exercise. It does not change other exercises or turn every strength goal into 5×5. A complete 25-rep session earns one saved load step; an improving partial session repeats the full target. Three consecutive same-load attempts without a rep gain can trigger an approximately 5% step-rounded reset. That cutoff and reset size are coaching conventions, not validated individual optima. Known short rest is addressed before a stall reset.
- The next-workout screen now states the performance that earns the following progression. The copied plan includes that trigger. The AI export includes an assigned-versus-actual comparison when a plan was activated and explicitly asks the receiving model to respect the current exercise roster, identify the scheme, use recent comparable attempts, and change the smallest justified variable.
- Distance-only cardio targets can now be retained without fabricating a time or pace target.

## Evidence boundaries

The broad choices follow the [2026 ACSM position stand](https://pubmed.ncbi.nlm.nih.gov/41843416/) and a [trial comparing load and repetition progression](https://pubmed.ncbi.nlm.nih.gov/36199287/). Longer rest can be important to strength performance in trained lifters ([systematic review](https://pubmed.ncbi.nlm.nih.gov/28933024/)). The exact 5×5 completion-and-repeat rule is a [named program convention](https://support.stronglifts.com/article/71-progression), not proof that 5×5 is uniquely superior. The app does not estimate a guaranteed timeline to a goal such as a 315 lb bench, silently add exercises, diagnose pain, or infer missing RIR, technique, rest, and recovery data.

## Verification

Run `npm test -- --runInBand`; review the Next up and export flows on localhost at an iPhone-sized viewport before publication. Confirm both an activated plan and a workout with no saved plan remain usable.
