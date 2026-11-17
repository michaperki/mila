# Learner model: what exists, what we learned, what's open

Written 2026-11-14, when the first research phase on modelling the learner ended. This file is the
reference for using the learner model in product work. It is not a plan for more research.

## What exists

| Piece | Where | Used by the app? |
|---|---|---|
| Learning events: Study (start, show, reveal, answer with the side shown first, end) and reading (read, select with the English setting, lookup, explained, save, unsave) | `apps/mobile/src/lib/study-log.ts`, `apps/web/netlify/functions/study-events.ts` → `studyEvents` | Recorded only |
| Learner model (learner-v1.1): recognition and production per word with 80% ranges and the evidence behind them, grammar per stage and slot | `apps/web/netlify/functions/lib/learner.ts` | No |
| Frequency ranks (OpenSubtitles, CC BY-SA 4.0) | `lib/frequency.ts`, `lib/frequency-he.ts` | No |
| Reading exposure: how often each saved word appears in the saved passages | `lib/exposure.ts` | No |
| Calibration: every answer predicted again from what was known just before it, against baselines | `lib/calibration.ts` | No |
| Learner profile for the card writer: words by what practice and reading show, not by estimates ([backlog LM-4](backlog.md#lm-4-personalized-card-writing)) | `lib/profile.ts`, used by `word-forms.ts` | Yes, for half the words |
| Frequency rank and lookups-since-saved for Study's intake order ([backlog STUDY-3](backlog.md#study-3-choosing-which-new-words-come-in)) | `lib/relevance.ts`, used by `vocab.ts` | Yes |
| Dashboard: observations, derived features and estimates per word; data coverage; calibration | `apps/web/scripts/learner-dashboard.mjs` → `scripts/eval-out/personalize/dashboard.html` | Local file |
| Harness: profile and vocabulary check | `apps/web/scripts/personalize.mjs` | Local |

Everything is read-only and free to run: no AI calls, no writes. Refresh the dashboard with
`node --experimental-strip-types scripts/learner-dashboard.mjs` from `apps/web`. Each run adds its
calibration scores to `calibration-history.json`, so model versions can be compared over time.

## What we learned (as of 67 answers)

- **The model predicts answers worse than simple baselines.** Log loss on all answers:
  - this card's results so far: 0.637 (the best predictor)
  - your overall success rate so far: 0.726
  - learner-v1.1: 0.869
  - learner-v1: 0.899

  Only the card's own history clearly beats the overall success rate. Any model that is used to
  make decisions has to beat **card so far** first.
- **The starting assumption was the main failure.** The frequency-based assumption describes
  whether a word was known before it was studied. Card answers come after a word has been
  introduced, often moments after. Rare saved words were answered right more often than common
  ones.
- **Priming matters.** Answers given just after seeing the Hebrew are right more often (59%), and
  the model doesn't expect that.
- **The vocabulary check is not a vocabulary size.** It found about 739 words (476–1,147), with
  the caveats below:
  - It tests written forms out of context, in spoken Hebrew.
  - Your knowledge falls off with rarity more gently than the model's curve assumes.
  - It is one weak input, not a measure of ability.
- **Reading exposure isn't evidence yet.** ינשוף was looked up three times and read 16 times, and
  the model still puts it near 0%. The model only counts the saves against it.

## Corrections made at the end of the phase (learner-v1.1)

- Ranges come from the Beta distribution itself. The old approximation collapsed to 0–0% near
  the ends.
- A starting assumption is never surer than 5% or 95%. This is a round bound, not a fitted one.
- Card results kept from before events were recorded are dated no later than they can have been,
  marked undated, and never counted twice with recorded answers.
- A word looked up on a card without its dictionary form is matched to a saved word by its
  spelling.
- The same word tapped again in the same place within seconds, while its meaning loads, counts as
  one lookup.

None of these were tuned to improve calibration. The dashboard shows learner-v1 beside v1.1.

## learner-v1.4 (2026-11-17)

- Each piece of evidence says what kind it is (answer, older result, help, lookup, save, note) and
  which events it came from, so Learning Insights can trace an estimate to what was done.
- A Hebrew word tapped on the answer side of a card shown in English is noted with no weight:
  after turning over, a tap there is mostly checking. Older taps don't record the side; it is taken
  from how the card was last shown in the session.
- A phrase selected and explained counts for the expression it was explained as. Phrase lookups
  were left out before.

## Open questions, for when a feature needs them or the data allows

- **Saves and reading:** a save shows the word wasn't known then. How should later reading
  without a lookup, or repeated reading, count? It should count as weak evidence, and never as
  proof.
- **Priming:** should a prediction expect a primed answer to go better, and how much should a
  primed answer count as evidence?
- **Before and after studying:** frequency for words not yet studied; a memory model per card
  (FSRS, run first in shadow mode) for words being studied.
- **Morphology and meanings:** ranks are of written forms, not dictionary forms. A word's senses
  and its forms are known separately (the grammar slots), but meanings aren't modelled.
- **Relevance:** combine general frequency with frequency in your own reading. Your reading so far
  is mostly one book.
- **Prediction versus learning:** calibration measures prediction only. Whether choices made by
  the model teach more needs comparisons within your own studying (some words chosen one way,
  some the other) and outcomes measured later: retention days later, and understanding the word
  when it turns up in new reading.

## Using it in product work

Look at the evidence when working on vocabulary selection, scheduling, exercise types, sentence
generation or reading help. Don't let uncertain estimates override how Study works today.

Start with what the data supports now:
- what you saved and looked up, and where
- each card's own history
- exposure in your reading

Revisit calibration from time to time, and change the model when a feature needs it and the
dashboard shows it helps.
