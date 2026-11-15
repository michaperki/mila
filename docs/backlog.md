# Mila backlog and roadmap

The one place that says what Mila is working towards, what was done, what's left and what would move
each thing forward. Detailed research lives in the linked docs and commits; this file only points
to it. Read it before starting product work; update it in the same commit as the work (see
[Keeping this up to date](#keeping-this-up-to-date)).

Last reviewed: 2026-11-15 (personalized card writing and frequency-aware intake shipped).

**Status words**
- **Done**: shipped and on the phone.
- **Partial**: some of the agreed scope shipped; the rest is listed under it.
- **Planned**: agreed with Mike, not started.
- **Exploratory**: an idea or proposal that hasn't been agreed or evaluated. Not a commitment.
- **Blocked**: agreed, but waiting on something named.
- **Parked**: deliberately set aside; revisit only with a reason.

**Priority**: P1 is next up, P2 follows, P3 is a someday possibility. Exploratory items have no
priority until they're agreed.

**Standing constraints** (from Mike; apply to everything below)
- Estimate API spend and get a go-ahead before anything that spends money. No eval scripts run
  against Mila's key without an approved budget.
- No bulk AI processing inside Claude Code. Enrich existing data through the export/import workflow
  (copy to a browser AI, paste back), or a Batch API run with its own approved estimate.
- No backfilling or refreshing old saved data unless Mike agrees to that specific case.
- Preserve the existing Study and Reader experience; no major scheduling or Reader change without
  a clear reason.
- Discovery (finding words) and scheduling (when they're studied) stay separate.
- Learner-model estimates don't drive decisions until they beat the card-history baseline
  ([learner-model.md](learner-model.md)).

---

## Roadmap

No dates; order only. Move items between bands as decisions are made.

**Now**
1. Use the new cards and intake order on the phone; check `personalize.mjs outcomes` after a
   couple of weeks ([LM-4](#lm-4-personalized-card-writing),
   [STUDY-3](#study-3-choosing-which-new-words-come-in)).

**Next**
2. [DATA-1](#data-1-export-and-import) Export and import foundation, then the
   [12 malformed entries](#vocab-1-the-12-malformed-phrase-entries) as its first use.
3. [VOCAB-2](#vocab-2-categories-level-and-register) Taxonomy and per-word categories, level and
   register (needs DATA-1 for existing words).
4. [STUDY-2](#study-2-review-intervals-that-grow) Review intervals that grow, starting with FSRS in
   shadow mode ([LM-5](#lm-5-fsrs-in-shadow-mode)).

**Later**
- [STUDY-3](#study-3-choosing-which-new-words-come-in) Smarter intake (frequency, interest,
  category spacing).
- [VOCAB-3](#vocab-3-explore-related-words) Explore related words and categories.
- [EX-*](#exercises) New exercise types, once a skill needs one.
- [READ-2](#read-2-page-level-glosses) Page-level glosses in the reader (needs a cost estimate).

---

## Learner model and personalization

Background and findings: [learner-model.md](learner-model.md). Investigation and plans: the
2026-11-14 session (architecture proposal; Phase 1 plan, approved with adjustments).

### LM-1 Learning events
**Done** (06083f0, 7633423). Study and reading events with links between them (`of`), stored in
`studyEvents`.
- Remaining, small: events are sent only when moving between screens, not when the app goes to the
  background. They wait safely on the phone. **Exploratory**: send on background (needs a phone
  update).

### LM-2 Learner model, dashboard and calibration
**Done** (fc882a8, 576fadc, fbe8cd6, c534a90). Research phase closed 2026-11-14.
- The model predicts worse than the card-history baseline. Don't let its probabilities drive
  decisions. Re-run calibration from time to time (`scripts/learner-dashboard.mjs`).
- Open questions (saves and reading exposure, priming, morphology and meanings, relevance,
  prediction vs learning) are in [learner-model.md](learner-model.md#open-questions-for-when-a-feature-needs-them-or-the-data-allows).
  Take one up only when a feature needs it.

### LM-3 Vocabulary check
**Done** (`scripts/personalize.mjs level`). Level about 739 words; not a vocabulary size. Not used
by the app.

### LM-4 Personalized card writing
**Done (first version, live 2026-11-15), measuring.**
- **What shipped:**
  - `lib/profile.ts` builds the profile from evidence, not model probabilities:
    - words recalled as Study counts it
    - words being learned
    - words looked up lately and not reliable (including unsaved common words)
    - words saved from reading and not studied
    - which way round each was answered
  - The writer gets it in the request, so the system prompt stays the same and cached.
  - Isolate, reinforce and stretch are offered as strategies, not quotas. Stretch is limited to one
    word per card from the reading list.
  - Half the words (chosen by word id) are written this way and half as before
    (`PERSONALIZED_CARDS=off|split|all`, default split). The current writer is the fallback.
  - Every new card stores `writer` and `support` (what its other words were to the learner then).
- **Comparison** (2026-11-15, $1.10 of $3): `scripts/eval-out/personalize/compare-*.md`.
  - On the same four words: unfamiliar words per card fell from 0.76 to 0.55, rare words from 6
    to 2, and sentences from 6.4 to 5.9 words.
  - Naturalness held. The first stretch wording let rare words in; the revised one doesn't.
  - Modest gains: the current writer already keeps to common words.
- **How it's judged over time:** `scripts/personalize.mjs outcomes`, for each writer:
  - lookups per showing
  - unprimed and first-answer accuracy, by side
  - answers given 2+ days later

  Read it as a trend over weeks, not from a handful of cards.
- **Remaining:**
  - **P2:** after a few weeks of `outcomes`, decide all, revise, or off.
  - **Exploratory:**
    - Grammar-aware sentences, once slot evidence exists.
    - Retention-based judgement (LM-7).
    - Rewriting existing cards: not done, by the no-backfill rule.
    - Showing which writer wrote a card in the app: left out so it doesn't bias answers.
  - Only 4 words count as "recalled reliably" so far, so most of the support comes from everyday
    Hebrew. The profile gets more useful as Study history grows.

### LM-5 FSRS in shadow mode
**Planned, P2.** Approved as part of Phase 1 (2026-11-14), kept separate from personalization.
Replay the study log through ts-fsrs at default settings and compare its predictions with the
card-history baseline. No scheduling change. Feeds STUDY-2.

### LM-6 Learner state shown in the app
**Exploratory.** For example "recognized 4/5 · produced 1/3" on a word's page, or grammar slots.
Proposed 2026-11-14 as motivating and correctable; not agreed. Show counts, not model
probabilities.

### LM-7 Learning outcomes
**Exploratory.** Measure retention days later and understanding of words met again in new reading,
not only card accuracy. Needs a few weeks of events. Prerequisite for claiming any feature teaches
better.

---

## Study

### STUDY-1 Round lifecycle
**Done** (279e527). Continue or start a new round after six hours away; ↻ in the top bar.
- **Exploratory**: "Study now" for a word just saved (Mike: "could be useful").
- **Exploratory, low**: a list of recent cards from the study log.

### STUDY-2 Review intervals that grow
**Planned, P2.** Familiar cards always rest a fixed 3 days, however well known. Mike wants the
approach investigated with the event data, not a fixed interval sequence.
- Proposal (2026-11-13): memory state for reviews only; primed answers aren't memory evidence; due
  reviews take a capped share of a round; no overdue pressure.
- Decisions needed: FSRS or a simpler streak rule (after LM-5); target recall; whether cards ever
  become "due".

### STUDY-3 Choosing which new words come in
**Partial.** Three separate decisions, kept apart: which new words come in (this item), when words
being learned come back (STUDY-2), and how their cards are written (LM-4).
- Done (2026-11-15): of the words not met again or saved lately, the more common come first (the
  3,000 most common, then to 10,000 and unranked, then rarer; shuffled daily within each); a
  saved word looked up again counts as met again, however rare. `rank` and `lookedUp` are worked
  out by the server on each fetch (lib/relevance.ts), never stored. The three queues (met again,
  recent, the rest) still take turns, and 3 new words a round is unchanged. Study's reason line
  says "common word · saved …" or "looked up again".
- Remaining, **exploratory**:
  - usefulness beyond frequency: register and level (needs VOCAB-2), and spoken vs written
    Hebrew (the frequency list is from subtitles);
  - reading relevance: words common in Mike's own reading (lib/exposure.ts counts it) but rare in
    general;
  - variety: one new word per category per round (needs VOCAB-2);
  - related words together (a root family once one is known);
  - a per-word Study soon / Normal / Later / Never control;
  - common words Mike keeps missing in reading, not saved (the profile's "shaky" list): offer
    to save them, or bring them into Study.
- Mike: unstudied saved words aren't a problem to clear; interest matters as much as usefulness;
  no rigid formula imposed early.

---

## Reader

### READ-1 Sentence selection without layout shift
**Done** (4d327dc). Inline English after the row the sentence ends on; one tap selects and
explains.
- Mike was unsure about the next sentence's first words sitting above the English. **Open**:
  refine after more use on the phone.

### READ-2 Page-level glosses
**Exploratory.** A meaning and dictionary form for every word of a page when it's read, for instant
lookups and exposure counting. Raises the cost of every page; needs a measured estimate before
it's proposed.

### READ-3 Cheaper word explanations
**Exploratory.** A lookup costs about $0.065 when the explanation prompt has dropped out of the
5-minute cache. A 1-hour cache could cut that; measure before proposing.

---

## Vocabulary

### VOCAB-1 The 12 malformed phrase entries
**Blocked** on DATA-1 (the `normalize-v1` import task). Proposed fixes per entry are in the
2026-11-13 plan. Mike's decisions: archive rather than delete; review each correction before it's
applied. The dashboard flags them.

### VOCAB-2 Categories, level and register
**Planned, P2.** Agreed direction 2026-11-13; taxonomy to be reviewed before anything is
classified.
- Proposal: a two-level taxonomy in code (about 10 domains, with a Language domain for connectives
  and function words), 1–3 categories per word, level (core, common, uncommon, rare), register
  (everyday, formal, literary, slang, technical). Stored on each vocab entry.
- New saves: extra fields in the word explanation (about $0.001 each). Existing words: via DATA-1
  in a browser AI, not Claude Code.
- Frequency rank now exists (lib/frequency.ts) and can stand in for level where it's reliable.
- Next action: draft the taxonomy for Mike's review.

### VOCAB-3 Explore related words
**Exploratory → planned after VOCAB-2, P3.** Extend the root explorer (`root.tsx`,
`root-family.ts`) to themes and categories. Thematic clusters rather than same-category sets, to
avoid interference. Words found this way come into Study more slowly than words met in reading.

### VOCAB-4 "Jeev"
**Blocked** on Mike: mentioned as a possible tool for categorization (2026-11-13); not identified.

---

## Data

### DATA-1 Export and import
**Planned, P2.** Agreed 2026-11-13.
- Full backup: JSON of every collection account deletion clears, plus the phone's study log and
  round, through the share sheet.
- Tasks in code (fields out, instructions, schema, fields allowed in); `classify-v1` and
  `normalize-v1` first.
- Import on the phone: paste, dry run (changed, unchanged, rejected with reasons), apply valid
  rows, fill-missing by default, protected fields never writable, undo.
- Mike: keep the first version simple (compact export, pasteable instructions, validated JSON
  import, preview).

---

## Exercises

Add a format only when a skill can't be measured or practised otherwise.

- **EX-1 Typed or multiple-choice production.** Exploratory. Self-grading is noisy; checked
  answers are more reliable but add friction. Mike hasn't decided.
- **EX-2 Cloze from saved sentences.** Exploratory (old P3 item, `MOBILE_FEEDBACK_PLAN.md` #16).
- **EX-3 Listening.** Exploratory. Hear a card's sentence before seeing it; TTS exists (`speech`).
- **EX-4 Grammar checkpoints aimed at a weak slot.** Exploratory. Needs grammar evidence that
  isn't there yet.

---

## Smaller and older items

- **Word speaker button, swipe between words in the drawer.** Exploratory (old P4,
  `MOBILE_FEEDBACK_PLAN.md` #18).
- **Library search and filters.** Partial (metadata done; search and filters not).
- **Live preview bounding boxes / AR overlay.** Parked.
- **Billing.** Parked (`payments.ts` is mocked).
- The 2025 docs in the repo root (`IMPROVEMENTS.md`, `UX_FEEDBACK_*`, `readlearn_ux_spec.md` and
  others) describe the deprecated web app. Their live ideas are folded in above; don't treat
  them as current plans.

---

## Keeping this up to date

- **At the start of product work**, read the Roadmap and the item being worked on.
- **When an investigation finds more than will be built**, add every unbuilt finding as an item
  (Exploratory unless Mike agreed to it) before implementing the part that was chosen.
- **In the commit that ships work**, update the item: what's done (with the commit), what remains,
  and the next decision or action. Add the item's ID to the commit message.
- **When Mike decides something**, record it on the item with the date and his wording where it
  matters.
- **When something is dropped**, mark it Parked with the reason rather than deleting it.
- Keep entries short and link to research instead of copying it.
