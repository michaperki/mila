# Mila backlog and roadmap

The one place that says what Mila is working towards, what was done, what's left and what would move
each thing forward. Detailed research lives in the linked docs and commits; this file only points
to it. Read it before starting product work; update it in the same commit as the work (see
[Keeping this up to date](#keeping-this-up-to-date)).

Last reviewed: 2026-11-19 (consolidation plan, phases A–D; phase A shipped: fill in the blank with one right answer, help recorded, Reader selections).

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
1. Use them on the phone, and check `personalize.mjs outcomes` after a couple of weeks:
   - new sentences in ordinary Study, chosen and written by Mila
     ([LM-4](#lm-4-personalized-card-writing), [LM-8](#lm-8-a-teaching-policy)), and the new cards;
   - fill in the blank ([EX-0](#exercises));
   - the intake order ([STUDY-3](#study-3-choosing-which-new-words-come-in)).

   Then iterate on what Mike reports.

**Consolidation (agreed with Mike 2026-11-19): stabilise and integrate before adding systems.**
Simplifying what Mike sees is kept apart from simplifying how Mila models learning. Evidence
collection keeps improving; models are compared only as data allows (191 answers on 66 words by
19/11), without choosing defaults early. Phases, in order:
- **A. Fill in the blank with one right answer** (shipped 2026-11-19, see [EX-0](#exercises)):
  answers in the word's form in the sentence, English as a hint, help recorded and weighed, an
  answered card shown as it was asked; Reader selections say how they were made and how long.
  Distractors for older cards: `scripts/backfill-distractors.mjs`, approved and run 2026-11-19:
  124 of 127 sentences on 64 studied words written, 3 refused as unusable (they stay flashcards);
  previous values in `scripts/distractors-backup-1795079052568.json`. **Cost $0.45 against an
  estimate of at most $0.26**: input was counted exactly, output was guessed at 120 tokens a
  sentence and came out higher. Next time cap output with `max_tokens` per request, or measure a
  few requests first. Checked: every answer is the word as its sentence has it; in a sample of 14,
  distractors are wrong in their sentence, one borderline (מבט מאשר for חמור).
- **B. Upcoming Study** (shipped 2026-11-19): Learning Insights opens on Upcoming Study: the rule
  the round follows in a sentence (Standard or Unified, with the settings in force), the round in
  progress, then the next new round, each card with its word, English, card, how it will be asked
  (flashcard and which side first, fill in the blank, checkpoint: the same rules Study applies,
  `lib/upcoming.ts`, `forms.ts frontFor`) and one plain reason; "new here" marks a card not in the
  last look. Diagnostics: Sessions, How it was planned (division, changes, every card considered),
  Unified ranking, Model checks. The by-part shadow score (score-v0) is retired: gone from screens,
  Model checks and new plans (which log the unified ranking, `rankingLog`); plans from 17–19/11
  keep it in the study log.
- **C shipped 2026-11-19** (first version, below as planned): Learning Insights opens on the
  Feed (`?feed=1`, server `lib/feed.ts`, feed-v0): last 7 days, newest first; each row what
  happened (card, how asked, help, time; or a sentence read: how chosen, how long selected,
  English on screen), then per word what the model took from it (skill and weight, or noted /
  recorded, not counted) and its estimate before → after (learner.ts `estimate` on the evidence
  the model holds now, at the moment of the evidence; "No change" when not counted). Reading: a
  row a sentence, its lookups and saves on one line each (a save joins the lookup it came from),
  and the saved words read past without a lookup in one line, recorded, never counted. A
  Still open: estimates start from today's starting point (level from today's saves).
- **C. Learning Feed, Study and Reader:** observed behaviour kept apart from inferred change. Each
  row a word (Hebrew, form, English): what happened; what the model took from it (which of
  exposure, recognition, comprehension, production, and how much; little or nothing when the
  evidence is ambiguous); the learner model's estimate before and after. Card history stays a
  comparison in Diagnostics, not a replacement. Reading summed up per sentence or passage; a row
  of its own only for a word with something to say (looked up, saved, a saved word passed). A
  lookup isn't proof a word was unknown, nor passing one proof it was understood: recorded as
  observations, read with low weight. Needs a server replay of the model in order.
- **D. Developer Tools in Account** (admins): AI spend, Learning Insights, tester passwords,
  vocabulary exports, imports and clean-ups, Study's experimental options. "Back up my data"
  stays in Account for everyone. Retire Settings → Try → New sentences; remove only preferences
  whose in-context control does the same.
- **Spending caps are enforced** (2026-11-19, Mike: "enforced, not just estimated"):
  `scripts/lib/spend.mjs cappedBatch` counts each request's input exactly, takes output at its
  `max_tokens`, and sends nothing unless that worst case fits `--cap <dollars>`; a request cut
  short at `max_tokens` is written nothing. `backfill-distractors.mjs` and `check-blanks.mjs` use
  it; the older paid scripts (backfill-alignment, -cues, -person-nouns, eval-forms, eval-writing,
  repair-cards) refuse to run until moved onto it; `personalize.mjs compare` stops before a call
  whose worst case would pass its budget.
- **One defensible answer per fill in the blank** (2026-11-19, investigated; check not yet run):
  `scripts/check-blanks.mjs` gives each sentence that can be a fill in the blank to a model as the
  learner sees it (gap, four options, no English, not told which is meant) and has it judge each
  option on its own; it passes only if the answer alone fits. The verdict is kept on the sentence
  (`blankCheck`) and the phone asks a failed or inconclusive one as a flashcard (inconclusive:
  not every option judged, or the request failed; checked again on the next run). **First run,
  approved, 2026-11-19:** 134 sentences on 66 studied words, $0.36 (cap $1): 124 passed, 8 failed,
  2 inconclusive. The failures were real second answers: לבקר for לשנוא ("hard to ___ someone who
  always helps you"), לנשק for ללטף (her hand), משבץ/מפספס for מנוקד (a sweater), להצחיק/להפחיד
  for להציף (memories), לשחות for לנהוג (forbidden after drinking), הנהג/הכרטיס for המושב (wet
  from the rain), לנסוע/לחזור for לעבור (to Tel Aviv), מקצר for מנוקד (text for first graders).
  Previous values: `scripts/blank-check-backup-1795089542259.json` (not committed).
- **Agreed next (Mike, 2026-11-19), not built yet:** check a card the same way when it first
  becomes eligible for a fill in the blank (lazily, like card word data, `card-words`), not when
  it is written (most cards are never studied); and the same wrong distractor chosen twice on a
  card as a reason to check it again. After Mike reviews Study and the Feed on the phone.
- **The Feed's estimates are estimates** (Mike, 2026-11-19): each change shows its 80% range after
  ("likely 25–60%"), and a move under 3 points is grey, "barely moved", never a measurement.
- **Not now:** Stage 2 probe cards (STUDY-2); theme classification and study packs (VOCAB-2,
  STUDY-3; existing classifications kept; packs, chosen or made by Mila, are a later direction);
  choosing Unified or the personalized writer as defaults (keep evaluating).
- **Maintenance, kept apart from features:** archive the 2025 root docs and `next_steps.md`;
  remove leftovers (the "Temporary, for checking cues" comment and the `studyQuiz` pref in
  practice.tsx); ARCH-5's time-limit check; VOCAB-1 when Mike chooses.
- **Reader evidence, measured 19/11** (9 sessions, 54 sentences selected, 172 lookups, 99 saves):
  sentences are mostly read in order (34 next, 7 ahead, 4 back; median 29 s each), almost every
  selected sentence had a lookup (52 of 54), 20 lookups were of saved words, 7 of 47 drawers
  closed within a second. All selections were in "EN · tap", so the English was on screen; that
  doesn't say it was read. Unsaved words have no dictionary form (quick meanings carry none), so
  words passed can only be matched to saved ones.

**The adaptive curriculum, still open** (kept here so it isn't lost between iterations):
- which new words come in: relevance and obscurity, Mike's reading exposure, related words, and
  register ([STUDY-3](#study-3-choosing-which-new-words-come-in), VOCAB-2/3);
- when words come back ([STUDY-2](#study-2-review-intervals-that-grow), LM-5);
- how they're taught: card writing ([LM-4](#lm-4-personalized-card-writing)) and exercise
  formats ([Exercises](#exercises)).

Learner evidence feeds all three, but they stay separate decisions.

2. **Remove Settings → Try → New sentences** once ordinary Study is seen bringing new sentences
   where they help (a few weeks of `outcomes`: new sentences written by `another-context` and
   `another-example`, and their cards' answers on later days). It stays only as a way to check
   the automatic behaviour, not as a feature (Mike, 2026-11-15).

**Next** (Mike's order, 2026-11-15)
3. **Mike reviews and applies** the [12 malformed entries](#vocab-1-the-12-malformed-phrase-entries)
   proposals (revised 2026-11-16) in Import changes → Fix entries. Nothing is applied without him.
4. **Mike organises the existing words** ([VOCAB-2](#vocab-2-categories-level-and-register)):
   share "Words to organise by theme" (150 at a time) with ChatGPT or Claude, preview and import
   the answer, repeat until none wait (about 4 rounds for 477 words). No Mila AI spend. New saves
   are organised already.
5. [STUDY-3](#study-3-choosing-which-new-words-come-in) Smarter intake, starting with spacing
   themes among a round's new words, once most words are organised.
6. [LM-5](#lm-5-fsrs-in-shadow-mode) FSRS in shadow mode (approved), then
   [STUDY-2](#study-2-review-intervals-that-grow) review intervals that grow.

Three decisions stay separate: which words come in (STUDY-3, VOCAB-2/3), when they come back
(LM-5, STUDY-2), and how they're taught (LM-4, LM-8, EX-*).

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
- Since 2026-11-15, waiting events are also sent whenever Mila goes to the background.
  Before, a session could wait on the phone until Study or the reader was next opened.
- Fill-in-the-blank answers log `exercise`, `tests` (word or form), `options`, `chosen` and
  `answer`; shows log `variant`, `writer` and `mode`.

### LM-2 Learner model, dashboard and calibration
**Done** (fc882a8, 576fadc, fbe8cd6, c534a90). Research phase closed 2026-11-14.
- The model predicts worse than the card-history baseline. Don't let its probabilities drive
  decisions. Re-run calibration from time to time (`scripts/learner-dashboard.mjs`).
- Open questions (saves and reading exposure, priming, morphology and meanings, relevance,
  prediction vs learning) are in [learner-model.md](learner-model.md#open-questions-for-when-a-feature-needs-them-or-the-data-allows).
  Take one up only when a feature needs it.

### LM-9 Learning Insights v0
**Live 2026-11-17, measuring.** Account → Learning Insights (admins only): sessions, one session
told event by event, one word, model checks. Read-only; nothing in it changes Study.
- **Supporting fixes shipped with it:**
  - learner-v1.4: evidence keeps the events it came from and its kind; a Hebrew word tapped on
    the answer side of an English-first card is noted, not counted; a phrase selected counts for
    the expression it was explained as.
  - New events: `app` (background and back), `view` (how far a passage is scrolled, as fractions),
    `closed` (a lookup's drawer: time open, when its meaning showed, details opened, how it
    ended), `hold` (every hold, with what it found). Card lookups record `position`, `side` and
    `front`; shows record `sentenceId` (a fingerprint of the sentence); `read` is logged when a
    passage opens; `save` records the saved word as `saved` (it was lost under the event's id).
  - Events are sent while the app is in use (every 20 events or a minute), not only on leaving.
  - Hints on English cards: matching tolerates English word order, shared "the/of/to" and
    contractions ("Not found" went from 25 of 1,056 holdable words to 1); an unmatched word says
    "No hint for this word".
- **Heuristics** (named in `lib/insights.ts`, all labelled in the app): `surprise` (the model at
  75%+ and wrong), `ambiguous-miss` (an English-first miss after help with other words),
  `common-save` (a saved word in the 3,000 most common: what Study did about it),
  `help-gap` (help with a common word not saved), `met-in-reading` (saved words in the sentences
  read, kept as exposure, never as knowing).
- **insights-v0.2** (2026-11-17, after Mike's review): plain words for Study's codes and card slots;
  every lookup, hint or answer the model didn't count says why; one word chip per card; a card's
  times from one rounding (question side + answer side = time on the card); card history as
  "33% from 1 answer" or "no answers yet, 50% by default"; late arrival said once per session, red
  only when a Study session started without the events; "hints asked"; reading sessions on the
  same passage within 10 minutes told as one visit; how a round ended in words; a constant
  baseline and a calibration table by direction in Model checks; evidence with its side said once
  and "date only, no time" for older results.
- **Sync stall found and fixed** (2026-11-17): three `context` events left on the phone by the
  reverted hint version (16/11) made the server refuse every batch from 16/11 06:27 UTC. Batches
  now keep valid events and set the rest apart (`studyEventsRefused`).
- **Reader selections** (2026-11-19): `select` says how the sentence was chosen (`via`: word,
  sentence, next, previous), and `deselect` when it stops being the selected one, with how long
  it was (`ms`), the English setting then and how it ended (another sentence, `done`, `left`).
- **Not yet:** reading exposure from `view` in the model or insights beyond counting; pages linked
  into books; what Study considered and didn't choose; the UX candidates (a swipe for the card's
  word only, expression units, "missed" marks), to decide from this data.

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
- **Verified live** (2026-11-15):
  - the first cards written on the phone carry `writer: personal-v1`;
  - the words API returns `rank` and `lookedUp`.
- **New sentences for words already being learned** (2026-11-15):
  - Study → Settings → Try → New sentences, or "New sentences round" at the end of a round.
  - Takes up to 4 words being learned, each in the stage last studied, and writes their cards
    again for the learner: same form and meaning, a new situation. About $0.03 per stage, once per
    card.
  - Each new sentence is kept on the card as a variant (`FormCard.variants`). The card's own
    sentence and its results stay.
  - Ordinary rounds then show the card's sentences in turn, one per answer.
  - Every show and answer logs `variant` and `writer`.
- **Iteration 2:**
  - A new sentences round takes up to 6 words, at most 2 cards each, a word at a time in turn.
    Its cards use the same presentation, exercise and sequencing rules as ordinary rounds.
  - Cards carry `mode: 'fresh'` in events, because answers there come from a different context
    than scheduled review.
  - The writer's difficulty rule is softer: a less familiar word is fine where the sentence makes
    it guessable, and not every sentence needs to be easy.
  - Wrong forms chosen are passed to the writer.
  - The profile grows by adding facts to `lib/profile.ts` and lines to `profileBlock`; the writer
    and its prompt don't change when the learner model gains a capability.
- **Iteration 3** (after Mike's phone test, 2026-11-15):
  - A new sentences round says what it is: the screen is titled "New sentences" (ordinary rounds
    "Study", no longer "Practice"), each of its cards says "New sentence · a word you're learning",
    the line under the top bar names it, and its end says the sentences come back in ordinary
    Study. The Settings entry is marked Experimental and says what it does.
  - Every round of them is genuinely new. Before, a second round for the same words found their
    cards written already (once per card), wrote nothing and showed the same "new" sentences.
    Now `freshPicks` takes, per word, the most lately studied stage whose cards don't all have a
    new sentence yet, and the round shows only sentences written just then; when no stage is
    left, it says so instead of repeating.
  - How it works, for reference: sentences are written when the round starts (one request per
    word, about $0.03 a stage), always by the writer told about the learner (`personal-v1`,
    whatever the split), and kept beside the card's own sentence. Revisiting a word in ordinary
    Study shows its sentences in turn. No writer labels in the app (see below).
  - Validation from events: the phone sessions with צד and שלם repeated, the "Meanings · שלם"
    header and four להתבייש cards in a row ran on the build before iteration 2 (update of
    07:29), kept going by a resumed round. No answers from iteration 2's build had arrived yet.
- **Remaining:**
  - **P2:** after a few weeks of `outcomes`, decide all, revise, or off.
  - ~~Once per card~~: lifted in LM-8's first iteration. Further sentences come when a card needs
    one, up to 4 a card, at most one a day.
  - **Exploratory:** Mila deciding on its own when a word needs another example, another context
    or a harder sentence, instead of the New sentences button (LM-8).
  - **Exploratory:**
    - Grammar-aware sentences, once slot evidence exists.
    - Retention-based judgement (LM-7).
    - Rewriting existing cards: not done, by the no-backfill rule.
    - Showing which writer wrote a card in the app: left out so it doesn't bias answers.
  - Only 4 words count as "recalled reliably" so far, so most of the support comes from everyday
    Hebrew. The profile gets more useful as Study history grows.

### LM-5 FSRS in shadow mode
**Started 2026-11-17** (see STUDY-2, Stage 1): FSRS-5 defaults, replayed per card on fetch, in
Model checks beside the learner model and card history. Before that: **planned, P2.** Approved as part of Phase 1 (2026-11-14), kept separate from personalization.
Replay the study log through ts-fsrs at default settings and compare its predictions with the
card-history baseline. No scheduling change. Feeds STUDY-2.

### LM-6 Learner state shown in the app
**Exploratory.** For example "recognized 4/5 · produced 1/3" on a word's page, or grammar slots.
Proposed 2026-11-14 as motivating and correctable; not agreed. Show counts, not model
probabilities.

### LM-8 A teaching policy
**Exploratory, the longer-term direction** (Mike, 2026-11-15). Learner knowledge should decide:
- what to teach next (STUDY-3)
- when to review (STUDY-2)
- which exercise type to use (EX-*)
- how much difficulty to bring, including when to write new sentences (LM-4)

Not a rebuild: each of these is a separate decision with its own code today (`intakeOrder`,
`deckOf`, `exerciseOf`, `sentenceFor`/`wantsSentence`, `profileBlock`). Each can take evidence
from the profile and learner model as it earns it, by beating its baseline.

**First iteration, live 2026-11-15** (mobile `lib/forms.ts`; every decision logged with its
reason, nothing shown to the learner but "New sentence" over a card in a sentence new to them):
- **Which sentence** (`sentenceFor`, logged as `sentence` and `sentenceNew`): its own at a first
  meeting; while being learned, the one last answered on (`repeat`: the same example again is how
  it's learned); once familiar, one it hasn't been answered on (`another-context`: is it known
  beyond that sentence?); wrong twice running, one not answered on (`another-example`); with all
  seen, the next in turn. Each sentence card now keeps which sentence each answer was on (`on`)
  and every sentence answered on (`seen`); older answers count as on its own sentence.
- **When to write one** (`wantsSentence`, while the round goes on, `varyAhead` in practice.tsx):
  only when a card is familiar with its last two answers right on the same sentence (known there,
  maybe only there), or wrong twice running on the same one, and it has no sentence left unseen.
  Never at a first meeting or while being learned normally. A card has at most 4 sentences, gets
  at most one a day, a Study visit writes for at most 3 words, and a learner's day at most 16
  requests (word-forms.ts, about $0.25); the New sentences button shares those limits. The one
  extra sentence per card limit is gone. Each sentence written keeps `why`.
- **How it's asked** (`exerciseOf`, logged as `exerciseWhy`): a card in a sentence new to it once
  familiar is a flashcard (`new-context`: recall there is the check of transfer); a card missed
  last time in the same sentence is a fill in the blank (`support`: recognition as a step, which
  can't make it familiar); a card right lately only by choosing or primed is a flashcard
  (`needs-recall`); otherwise about one in three a choice (`check`), as before.
- **Judged by** `scripts/personalize.mjs outcomes`: answers by sentence reason, new or not, and
  flashcard or choice, primed apart, with the card's next unprimed answer on a later day; how
  cards were asked; new sentences written by why.
- **Open:** whether `another-context` cards hold up days later better than cards kept in one
  sentence (LM-7); difficulty (a harder sentence for a card familiar across several; the writer
  is told the profile but not what the card needs, which `why` could carry); production
  exercises (EX-1); review timing (STUDY-2) stays as it is.

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
**First step live 2026-11-17** (approved from the scheduler research the same day):
- A started word is due a day after a missed answer and two days after a right one, in calendar
  days (`dueOf`). Rounds take due words first, the least late for their interval first, so a word
  met yesterday is reviewed today while a backlog is worked through behind it (`byDue`). Words
  not due only fill a round with room.
- New words slow down while reviews wait: 2 a round with 8 or more due words left out, 1 with 20
  or more (`backlogFewer`, `backlogFewest`). On 17/11 that meant 49 due, 14 in a round, 1 new word.
- Kept as they were: the word → meaning → present sequence (`followUps`), spacing a word's cards,
  familiar checks after 3 days, checkpoints, how each card is asked.
- `planRound` builds the round in steps (reviews, words not due, new words, familiar checks,
  order) and returns every card it considered with why it did or didn't take it; `deckOf` is its
  cards. Each round's plan is logged (`plan` event). **Learning Insights → Upcoming** shows the
  round Study would plan now, the cards left out with why, and what changed since it was last
  looked at.
- **Shadow score, live 2026-11-17, retired 2026-11-19** (consolidation phase B; superseded by the
  unified ranking; its logged plans kept) (`lib/scoring.ts`, score-v0; changed nothing Study did):
  (usefulness + reading) × timing × need, + 0.3 × value × recently introduced, + 0.15 ×
  uncertainty. Need is smoothed from the word's kept answers, a primed answer a quarter, so one
  swipe moves it little. Each round's plan logs the score's ranking beside Study's
  (`plan.shadow`); Upcoming → Candidates shows it word by word, part by part, with disagreements;
  Model checks → "Shadow score against what happened" follows each scored word for 7 days
  (shown, next unprimed answer) by need and by who would take it. The word list fetch now carries
  `firstStudied` (only where every answer was recorded) and `reading` (times met in what was read).
  **Next:** after about a week, review the disagreements; if they look right, order reviews by
  the score (the first behaviour change), keeping the parts of a round and the follow-ups.
- **Stage 1 of the transition, live 2026-11-17 (shadow only):**
  - **Memory model** (`lib/memory.ts`, FSRS-5 with its published defaults): every card's answers
    replayed on each fetch, nothing stored, so a later one-time recalculation has nothing to
    migrate. Older results without a time are placed before answers were recorded. It is a model
    of recall over days: compared only on answers a day or more after a recorded answer.
  - **Unified ranking** (`unifiedRanking`, unified-v0): reviews, reinforcement of words first
    studied in the last 4 days, familiar checks and new words on one list by value now: usefulness
    × what practising now adds to recall 30 days on, per card; new words on an assumed path (about
    6 cards from 20% to 60%). Knowledge, confidence and value are kept apart. Logged with each plan.
  - Insights: Upcoming → Candidates → Unified; each card's memory on a word's page; Model checks →
    Memory model (beside the learner model and card history) and Recall on a later day (the
    baseline before any change).
  - **First reading** (17/11): on 84 answers including guessed gaps, log loss memory 0.59, learner
    model 0.70, card history 0.54; its defaults expect more recall than Mike shows (למען 85% vs his
    31% right). Too few answers after recorded gaps to judge it yet.
  - **Priming in the memory model** (2026-11-17): a right answer just after seeing the word is an
    exposure, not a recall (it no longer starts a meaning card at three days); a primed miss is a
    lapse. On the 7 fair answers so far, log loss went from 0.59 to 0.53 (learner model 0.56, card
    history 0.45). The due rule of standard Study still counts primed answers as before.
  - **Unified order as an opt-in experiment** (2026-11-17): Study → Settings → Try → Plan rounds
    by: Standard / Unified (`planUnified`). Unified takes the unified ranking's activities by value,
    one card each (a met word's word card becomes a sentence not yet answered), new words early,
    and keeps the word → sentence sequence, spacing, checkpoints and how cards are asked. Each
    plan logs its `planner`; Upcoming plans by the chosen one. Standard stays the default.
  - **Stage 2 agreed:** 2–3 probe cards a day, in ordinary rounds, replacing cards rather than
    adding them, to measure recall independently of the scheduler. After reviewing Stage 1.
- **Later** (from the research): a memory model per card in shadow (LM-5) shown in Upcoming beside
  the due rule; usefulness inside each part of the round; an exploration slot; probe cards at set
  delays and a split by word to judge a new scheduler on later-day recall and lookups in reading,
  not on in-round accuracy.

**Before that: planned, P2.** Familiar cards always rest a fixed 3 days, however well known. Mike wants the
approach investigated with the event data, not a fixed interval sequence.
- Proposal (2026-11-13): memory state for reviews only; primed answers aren't memory evidence; due
  reviews take a capped share of a round; no overdue pressure.
- Decisions needed: FSRS or a simpler streak rule (after LM-5); target recall; whether cards ever
  become "due".

### STUDY-4 Repetition within a round
**Done** (2026-11-15). Three purposes, three rules:
- **Introduction:** a word's learning sequence (word card, then its meaning, then its present)
  stays together on purpose.
- **Reinforcement:** a word's other cards in a round are spread at least 4 cards apart where
  there's room (`spread`).
- **Review:** familiar cards come only for words the round doesn't otherwise show, so they test
  retention unprimed.
- An answer just after the word was shown is still marked primed and counts a quarter in the
  model.
- **Exploratory:** whether a round should hold fewer words more often, or more words once; choose
  by retention data once STUDY-2 exists.

### STUDY-3 Choosing which new words come in
**Partial.** Three separate decisions, kept apart: which new words come in (this item), when words
being learned come back (STUDY-2), and how their cards are written (LM-4).
- Done (2026-11-15): of the words not met again or saved lately, the more common come first (the
  3,000 most common, then to 10,000 and unranked, then rarer; shuffled daily within each); a
  saved word looked up again counts as met again, however rare. `rank` and `lookedUp` are worked
  out by the server on each fetch (lib/relevance.ts), never stored. The three queues (met again,
  recent, the rest) still take turns, and 3 new words a round is unchanged. Study's reason line
  says "common word · saved …" or "looked up again".
- **What VOCAB-2 gives it** (2026-11-16): every organised word has its themes (main first),
  register and level, read on the phone through `lib/taxonomy.ts` (`themesOf`, `levelOf`).
  Organisation describes words and never decides by itself; intake reads it as one signal beside
  frequency, reading exposure and what is known. Proposed first use, small and reversible: no two
  of a round's new words share a main theme (less interference, more variety), then words of a
  theme the learner is reading a lot of come a little sooner. Not before most words are organised.
- Remaining, **exploratory**:
  - usefulness beyond frequency: register and level (VOCAB-2 has them now), and spoken vs written
    Hebrew (the frequency list is from subtitles);
  - reading relevance: words common in Mike's own reading (lib/exposure.ts counts it) but rare in
    general;
  - variety: one new word per category per round (VOCAB-2 has them now; the first use above);
  - related words together (a root family once one is known);
  - a per-word Study soon / Normal / Later / Never control;
  - common words Mike keeps missing in reading, not saved (the profile's "shaky" list): offer
    to save them, or bring them into Study.
- Mike: unstudied saved words aren't a problem to clear; interest matters as much as usefulness;
  no rigid formula imposed early.

### STUDY-4 Help with one word on a card shown in English
**Done, first version** (2026-11-16). The problem (Mike, who studies almost only English first):
knowing the card's word but not the other Hebrew words needed to build the sentence, and having to
turn the whole card over for them.
- **The interaction** (third version, 2026-11-16; Mike: keep the card simple, the learner model
  records what was asked, the screen needn't show it): press and hold an English word (not the
  card's own, marked one) and the Hebrew that says it, as the sentence writes it, shows on one
  quiet line under the sentence; the word is marked only while held. The next hold replaces the
  line and turning the card over clears it. A word Hebrew has no word of its own for, the card's
  own word (a suffix on it), or one that couldn't be matched says so on the same line. A tap still
  turns the card over; the answer side is as before (tap any word for the drawer, to save it).
  The line under the card says "Hold any word for its Hebrew" until the first hold. Earlier
  versions this day: a floating bubble (hid the sentence; a spinner while loading), then chips
  gathering under the sentence with underlines (cluttered).
- **A card carries what it needs** (Mike: flashcards should be self-contained): each sentence's
  glosses say what each word means there and which English words say it (`t`). New cards and new
  sentences have it from the writer. Older ones get it before they are shown: when Study builds a
  round, it asks `card-words` for the round's cards without it, in the background, in order, two
  at a time, and the server keeps it on the card for good (about $0.007 a sentence, once, only for
  cards that come up). Then, the same way, the round's words' other cards that an answer may bring
  in mid-round (a new word's sentences after its word card; `lib/forms.ts mayFollow`, 2026-11-17),
  which before weren't prepared and waited when a word was held. A word held on a card not yet prepared asks for that sentence then
  (`card-words` with `variant`, counted apart as `card-words-now`, logged as `from: 'late'`): the
  fallback, which should be rare; Account → AI usage and `ai-report.mjs` show how rare. Saving a
  word and More still ask for the full explanation, as they create or show a dictionary entry.
- **Matching an English word to the Hebrew** (`lib/english-help.ts`, on the phone, from the
  glosses' `t`): exact words in order, a word or two allowed between a phrase's words ("would only
  come"), Study's person cues skipped.
- **Measured 2026-11-16:**
  - a faster model for the matching: Sonnet 5.5 agreed with Opus on 93 of 99 English words and
    Haiku 5.5 on 94, at 2.5 and 2.1 s against Opus's 2.7 s; one Haiku match was wrong ("this" for
    לחודש). Not switched: half a second isn't worth worse matches;
  - three new sentences written live after the change all had `t` on every gloss;
  - backfilled (approved, `scripts/backfill-alignment.mjs`): the sentences of cards answered in
    the last 30 days or shown in the last 14, with their new sentences, through the Batch API.
- **What is recorded:** each Hebrew word given is a `lookup` with `help: 'english'`, the English
  word held, its place, dictionary form when known, whether it is saved and where the matching
  came from; the answer lists the places given (`asked`).
- **How it is read** (learner-v1.3): a word given counts against producing it (0.5), not reading
  it; the card's own answer counts as before (the help was with another word and never showed
  it), and it isn't noted against the card; a word not asked for is no evidence. Study's card
  progress is unchanged. `personalize.mjs outcomes` reports it.
- **First attempt, reverted** (8990634, fb51150, reverted in 68f68af): tap-for-meaning on Hebrew
  cards, then the Hebrew sentence shown with the word blank on English ones. Cluttered and awkward
  on the phone, and on an English card it made the learner find the Hebrew for the English word
  they were stuck on.
- **Not done:** the same hold on Hebrew-first cards (decided to wait until this feels right).

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
**Ready for Mike to apply** (proposals 2026-11-15, revised 2026-11-16).
- Proposals, each with its reason, are in [vocab-1-proposals.md](vocab-1-proposals.md):
  - 6 worth learning, corrected to dictionary forms: fixed pairs and idioms, collocations Mike
    selected, the conjunction בזמן ש ("while", from the clause בזמן שעמד, archived in the first
    draft), and קישטא relabelled as an interjection;
  - 5 malformed (clauses, words that only stand together), archived; each one's useful word is
    saved on its own.

  Paste the JSON into Import changes (Fix entries) to preview. Nothing is applied until Mike does,
  and an import can be undone.
- Studied entries keep their progress, and their stages don't change (phrase and expression
  without a head word study the same).

Earlier: blocked on DATA-1 (the `normalize-v1` import task). Mike's decisions: archive rather than
delete; review each correction before it's applied.

### VOCAB-2 Categories, level and register
**Done, first version** (2026-11-16). Existing words wait for Mike to organise them through the
export/import (no Mila spend); new saves are organised as they are saved.
- **Taxonomy v1** (`lib/taxonomy.ts`, server; names on the phone in `lib/taxonomy.ts`, checked
  equal by a test). Revised from draft-1 against the 477 saved words (185 verbs, 133 nouns, 80
  adjectives, 37 expressions):
  - 17 broad themes: people, body (and health), feelings, character (and how people treat each
    other), mind, senses (seeing and light), speech (and sounds), movement, doing (acting,
    trying, causing, happening), appearance (clothes and looks), home, town (and work), nature,
    place (position and direction), time, magic (and stories), grammar;
  - added: `doing`, for the general verbs that had nowhere to go (to cause, to manage, to cope),
    `senses`, one of the novel's biggest groups (to stare, gleaming, dim, golden), and `place`;
    `structure` became `grammar`, for connectives, quantities and constructions (liable to
    [verb], half [X] half [Y]);
  - themes are topics by meaning, so verbs and abstract words belong where their meaning does; a
    word takes one to three, the main one first, or none; part of speech still says what kind of
    word it is (an expression, a pattern);
  - registers: everyday, formal, literary, informal, technical;
  - level: from frequency rank (core ≤1,000, common ≤3,000, uncommon ≤10,000, rare), set by an
    import only for words frequency can't place.
- **Revising it later:** an entry keeps the version that classified it (`taxonomy`). A revision
  gets a new version, and "Words to organise by theme" then offers the words classified under the
  older one again. Ids are never renamed once used. No migration.
- **In the app:**
  - the word list has a second row of theme pills once words are organised, most words first,
    with "Not organised" last; it combines with the status pills and search;
  - a row says "rare" for a rare word, and nothing more, to keep the list quiet;
  - the word page shows themes, register and level.
- **Existing words** (Account → Saved words → Words to organise by theme): the words not yet
  organised with this version, 150 to a file, with instructions and the taxonomy for ChatGPT or
  Claude; their answer goes into Import changes, which checks every theme against the taxonomy
  (at most three, no repeats, known ids), previews and applies, and can undo. After each import
  the next share has the words still waiting.
- **New saves:** the word explanation the save already waits for also gives the lemma's themes
  and register (and the expression's, when an expression is saved), so no call is added. The
  server keeps them only where the word has none yet, so an import's or an earlier save's stay.
  Cost: about 25 more output tokens and 500 more cached prompt tokens a call, about $0.0006, so
  about $0.50 a month at today's 800 explanations. The explanation cache moved to v12 (its hit
  rate is near zero, so nothing is lost).
- **Not done:** editing a word's themes by hand; level for unranked words from the save (only an
  import sets it); themes in Study (that is STUDY-3, which reads them as one signal).

Agreed direction (2026-11-13): a taxonomy in code, 1–3 categories per word, level and register
stored on each entry; new saves through the explanation, existing words through DATA-1 in a
browser AI, not Claude Code.

### VOCAB-3 Explore related words
**Exploratory → planned after VOCAB-2, P3.** Extend the root explorer (`root.tsx`,
`root-family.ts`) to themes and categories. Thematic clusters rather than same-category sets, to
avoid interference. Words found this way come into Study more slowly than words met in reading.

### VOCAB-4 "Jeev"
**Blocked** on Mike: mentioned as a possible tool for categorization (2026-11-13); not identified.

---

## Data

### DATA-1 Export and import
**Done, first version** (2026-11-15). On the phone, Account → Saved words:
- **Back up my data:** everything account deletion would clear, as stored, plus the phone's unsent
  answers and events and the round in progress, as one JSON file through the share sheet.
- **Words to organise by theme** (`classify-v1`) and **Words saved in the wrong form**
  (`normalize-v1`): a file with instructions and the words, to give ChatGPT or Claude.
- **Import changes:**
  - paste the AI's answer, preview every change from what to what, and see each refused row with
    why;
  - apply it, and undo a recent import.

  Preview and apply share one check (`lib/data-tasks.ts planImport`). Learning fields can never
  be written.
- **Archived words** stay saved but leave the list and Study.
- **Remaining:** merging two entries (a dictionary form saved twice); more tasks as needs come
  (each is a definition in `TASKS`); restoring from a backup (the file has everything, but there's
  no restore yet). How it all flows: [architecture.md](architecture.md#data-in-and-out).

Original plan (2026-11-13):
- Full backup: JSON of every collection account deletion clears, plus the phone's study log and
  round, through the share sheet.
- Tasks in code (fields out, instructions, schema, fields allowed in); `classify-v1` and
  `normalize-v1` first.
- Import on the phone: paste, dry run (changed, unchanged, rejected with reasons), apply valid
  rows, fill-missing by default, protected fields never writable, undo.
- Mike: keep the first version simple (compact export, pasteable instructions, validated JSON
  import, preview).

### How DATA-1 fits the architecture
- The export is the learner's words as the server stores them (`vocab` documents), plus the
  phone's study log and round. No new store or format of its own.
- The import is one server path, `vocab` PATCH `import`. It:
  - validates each row against the fields a task may write (`classify-v1`: categories, level,
    register; `normalize-v1`: lemma, gloss, part of speech);
  - merges by `id`;
  - never touches learning fields (`results`, `primed`, `on`, `seen`, `forms`, `checkpoints`,
    `encounters`).

  The dry run is the same code without the write.
- New fields are ordinary entry fields read by teaching decisions (`intakeOrder`, later
  `studyPool`), never by prompts directly. Like `rank`, anything derivable (level from frequency)
  is computed on read, not stored.

---

## Exercises

Add a format only when a skill can't be measured or practised otherwise. Study decides how a
card is put to the learner in one place (`practice.tsx presentation`): which sentence, and
flashcard or fill in the blank. A new format is another branch there plus its logging.

- **EX-0 Fill in the blank (multiple choice).** **Done** (2026-11-15).
  - It existed before as "Quiz forms", off by default and never used (0 answers).
  - Now it's part of ordinary rounds ("Fill in the blank: Sometimes", the default): about one in
    three sentence cards answered before, never at a first meeting.
  - The card shows the sentence with the word left out, its English, and four Hebrew options:
    - for a form card, the word's other forms (agreement and tense in context);
    - for a meaning card, other saved words of the same part of speech, practised ones and those
      about as common first.
  - Logged as `exercise: 'choice'` with what it tested, the options, the choice and the answer,
    and no side first, so it isn't counted as recall or production.
  - Its result counted toward the card in Study like a recalled one (changed in iteration 3).
  - **Iteration 2** (after Mike's phone test):
    - A choice records itself and moves on after a pause: 0.9 s when right, 2.2 s when wrong.
      Looking up a word on it, swiping or the arrows stop that.
    - Going back shows how it was answered (the answer, the choice) and can't be answered again,
      including in a resumed round.
    - A meaning question no longer shows the word in its header. It keeps the sentence's English:
      with the word's English blanked, a related distractor could fit as well (live test: ללטף
      against לנשק in "began to ___ her hand"), so the question is "which Hebrew word says this
      here". A form question keeps the infinitive and the English, since the choice there is the
      form.
    - The blank is drawn visibly (＿＿＿).
    - New meaning cards come with three distractors from the writer: related, common and wrong
      in this sentence, never one that also fits. Older cards still choose among saved words.
    - Never offered just after another card of its word, or in a learning sequence, so it's an
      unprimed check.
    - The learner model counts a meaning choice toward reading the word, at 0.6 weight; a form
      choice counts toward that grammar slot only (learner-v1.2). Wrong forms are passed to the
      card writer.
  - **Iteration 3** (2026-11-15):
    - A choice no longer counts as an unaided answer toward Study's card progress. It's kept
      marked like a primed answer (`primed`, the card's record), and a card is familiar only when
      its last two answers were right and one of them was unaided. So a right choice can keep a
      card familiar, or confirm a recall, but two right choices don't make it familiar.
      Existing progress is unchanged; events keep `primed` as it was, and the choice as a choice.
    - A card right lately only by choosing or primed (`awaitsRecall`) is asked as a flashcard
      next, in Sometimes and Always alike, so it can't get stuck as a choice.
    - Older cards' options leave out saved words whose meaning shares a word with the target's
      (לבדוק beside לבחון, both "examine"), which the English shown would fit too.
    - A wrong choice waits 2.5–5 s by the length of the sentence, and a tap on the card holds
      it there; a right one still 0.9 s. Opening settings or starting a round stops the wait.
  - **Iteration 4** (2026-11-19, consolidation phase A, after Mike's review):
    - **One right answer without the English.** A meaning card is a fill in the blank only with
      distractors written for its sentence, in the form the word has there (`blankAnswer`):
      `distractorsFor` (the word as in the sentence, vocalized) is then the answer, and the blank
      takes the whole word. Older dictionary-form distractors serve only a sentence with the
      dictionary form in it (spelling aside). Otherwise a flashcard: the saved-word fallback is
      gone for meaning cards, since without the English another saved word could fit. Fixes שלם
      offered for שלמה (26 of 797 meaning sentences inflected the word; 5 on answered cards).
    - **English as a hint** on a meaning fill in the blank: hidden, "Show English" shows it
      unmarked, logged as `hint` (`kind: 'english'`). A form choice keeps its English, which says
      which form the sentence needs.
    - **Help recorded with the answer** (`assisted`: 'english', 'hebrew-word' for Hebrew given for
      held words). The learner model (learner-v1.5) counts it less, by kind: half with the English,
      three quarters with words given; never as wrong. Study's familiar rule is unchanged.
    - **Show the question** on an answered fill in the blank: the blank and its choices as asked,
      read-only, the answer kept; "Show your answer" goes back. (Flashcards already come back to
      their question side.)
    - **Writer:** meaning sentences may use the form the sentence needs where the dictionary form
      would be forced (Mike: natural Hebrew first); distractors are written in the word's form
      in its sentence and rule themselves out from the Hebrew alone.
  - Remaining, **exploratory**:
    - choosing the exercise type by what the learner needs (see LM-8);
    - choices for word cards in ordinary rounds;
    - a typed answer (EX-1).
- **EX-1 Typed production.** Exploratory. Self-grading is noisy; checked answers are more
  reliable but add friction. Mike hasn't decided.
- **EX-2 Cloze from the sentences Mike saved while reading.** Exploratory (old P3 item,
  `MOBILE_FEEDBACK_PLAN.md` #16). EX-0 uses the cards' own sentences.
- **EX-3 Listening.** Exploratory. Hear a card's sentence before seeing it; TTS exists (`speech`).
- **EX-4 Grammar checkpoints aimed at a weak slot.** Exploratory. Needs grammar evidence that
  isn't there yet.

---

## Architecture and efficiency

Findings of the 2026-11-15 review, measured with `scripts/ai-report.mjs`. How it all works and the
engineering principles agreed then: [architecture.md](architecture.md). Overall: the four
responsibilities (learner state, teaching decisions, generation, delivery) are reasonably
separated and no redesign is needed. The issues below are ranked by impact.

### ARCH-0 Fixed in the review
**Done** (2026-11-15).
- Card and new-sentence requests for the same word and stage share one request while it's on its
  way (`lib/shared.ts`), so Study starting, an answer opening a stage and a word's page can't pay
  for the same cards twice.
- The word list (1.5 MB, 267 KB gzipped, 0.7–1.6 s) was fetched again on every visit to Home,
  Vocabulary, a word page or the Reader's drawer. Now it's only fetched when it's more than
  2 minutes old (pull to refresh always fetches).
- `scripts/ai-report.mjs`: cost, latency, prompt-cache and answer-cache use by feature, and how
  much of what was generated was ever used.

### ARCH-1 Reader word explanations are half the AI spend
**Decided: keep as is** (Mike, 2026-11-15: lookups are central, about $0.35 a reading day is
acceptable).
- **Measured since:** 511 saves against 790 paid explanations in 30 days. A save needs the
  explanation anyway (its dictionary form), and the tap and the save share one call (phone memo,
  in-flight sharing, `aiCache`). So explaining only on More or Save would save at most ~35% of
  explanation cost, about $4 a month.
- **Quality:** the quick meaning (`sentence-glosses`) gives a word's meaning in its sentence but
  no dictionary form, root, binyan, constructions or expression detection. That last one is what
  turns a tap into the right save, such as נטייה ל.
- **Recommendation:** don't change it. Revisit only if reading volume grows several-fold. The
  cheapest change then would be to show the quick meaning first (it already shows) and ask for the
  explanation after a short pause, or on More or Save, rather than a cheaper model, which would
  need an eval budget.
- **No duplicate calls found:** glosses and explanations are each asked for once per word and
  sentence, and shared.

Original finding: 797 calls and $11.06 of $21.65 in 30 days
(Opus 5.5, ≈$0.014 and 4.4 s each). It's asked for on every Reader tap, though the quick meaning
is already there. Study cards ask only on More or Save. Repeats are rare (5 cache hits), so
caching can't help. Options, each a product decision for Mike:
- ask only on More or Save in the Reader too (the drawer would show the quick meaning, lemma and
  Save first);
- a cheaper model for the tap, with Opus on More. Needs an eval with an approved budget;
- leave it: about $0.35 a reading day.

### ARCH-2 A lighter word list
**Deferred** (2026-11-15). Leaving the stored explanations out of the list would need the
Reader's drawer to fetch them for a saved word tapped again, and with refreshes throttled
(ARCH-0) it's ~267 KB a few times a day. The backup now carries the full data, so the list can be
slimmed later without losing anything. Revisit if the list grows well past 1,000 words.
Original note: 1.5 MB, of which the explanation kept on each encounter is about
0.4 MB. The phone needs it only when a saved word is tapped again in the same sentence.
- Leave `encounters[].analysis` out of the list, and fetch it with the word when needed.
- Or fetch only what changed since `updatedAt` (deletions need a marker).

Not urgent now that refreshes are throttled.

### ARCH-3 Results that fail to save aren't retried
**Done** (2026-11-15).
- Each answer's update (the card's whole record) waits in a file on the phone until the server
  has it (`lib/results.ts`), newest per card only.
- It is sent at once and again on Study open, word fetches, and foreground or background.
- The server keeps it only if it's no older than what's stored, so repeats and late arrivals are
  harmless.
- Fetched words show unsent answers laid over them.
- Tests cover offline, restart, a refused update, a card answered again mid-send, and overlay.

Original finding: A failed `vocab` PATCH shows an error, but the card's record on the server misses
the answer, though the study log has it. Queue results on the phone like study events, send them
in order, and keep the latest result per card.

### ARCH-4 Cards written that were never studied
**Partly historical.** 1,598 cards are written, but only 79 have been answered, and 434 of 477
words have cards while only 59 were studied. Almost all of this is from before 2026-11-04, when
cards were written for every saved word. Now they are written only for a round's words and the
next to come in (`upcoming`: about 18 started and 6 new, $0.3–0.7 on a study day). One smaller
risk remains: the new words are reshuffled daily, so cards may be written for words that then
don't come in for a while. Revisit if `ai-report.mjs` shows written stages growing faster than
studied ones. No backfill or deletion of old cards.

### ARCH-5 Function time limit unverified
**Planned, check only.** Card writing makes 2–3 model calls in one request (p90 6.7 s each).
Check Netlify's function timeout for the site before adding steps. If it's tight, return the cards
before the cue check, or split the check into its own request.

### ARCH-6 Boundaries to tidy when next touched
**Exploratory, no work on its own.**
- Move writing ahead (`prepareAhead`, `varyAhead`, merging variants) from `practice.tsx` into
  `lib/word-forms.ts`, so Study asks for content rather than managing it.
- Split `lib/forms.ts` into progress rules, teaching decisions and card helpers.
- Study's familiar rule is in `lib/forms.ts` and again in `lib/profile.ts`; change them together,
  or have the phone send its card states.
- Give the writer the teaching reason (`why`) so it can aim a sentence (LM-8 difficulty).

### ARCH-7 Measured and not worth changing
**Parked.**
- **A one-hour prompt cache instead of five minutes:** about $0.16 a month saved on explanations.
  30 of 72 cache writes came after gaps under an hour, but writes cost more at that rate.
- **Old `aiCache` versions:** 680 unused rows, 0.9 MB.
- **Failed AI calls aren't logged in `aiUsage`** (only in function logs). Add a `failed` row if
  failures become a question.

### DEBUG-1 Debug capture and viewer
**Done, first version** (2026-11-22, 9b03cd4). Account → Debug capture in Mila Preview (admins):
start, use Reader or Study, open the capture at mila-hebrew.netlify.app/debug.html on a laptop.
- Phone (`lib/trace.ts`): screen states (reader: sentence, quick meanings, drawer; study: card,
  side, answer, English shown, held-word hint, drawer), actions passed explicitly through async
  work (`Act`; a prefetch is its own action with the one that set it off as parent), requests
  (`lib/api.ts`, with the action and a request id in headers), and work done on the phone with
  where its result came from (phone memory, a request already on its way, saved with the word,
  the card's own data, scored on the phone). Sent every few seconds while on.
- Server (`lib/trace.ts`, `lib/trace-ai.ts`, AsyncLocalStorage): the request, instance memory,
  `aiCache` reads and writes, the daily spend check, `vocab.updateOne` for a card's result, and
  each model call with why, the inputs by name, tokens and cost; the exact request to the provider
  only in a capture started with "Exact AI prompts". Wired into word-analysis, sentence-glosses,
  card-words, word-forms and vocab. Nothing is recorded outside a capture; a capture stops after
  two hours. Stored in `debugCaptures`, `debugSpans` (cleared with the account).
- Viewer (`public/debug.html`): lanes Screen, Actions, Phone, Network, Server, Database, AI; zoom;
  a moment slider with the screen then and what was still in progress; a click shows a span's
  action, timing, source, fields, the rest of its action and, if kept, the exact prompt. Server
  times are set inside their request (clocks differ). Manual refresh.
- **Not yet:** other functions (insights, texts, speech, study-events) and the save path in the
  drawer; live updating; reading `aiUsage` alongside.

### DEBUG-2 Usage view
**Done, first version** (2026-11-26). For Mike, as the developer: which controls get used, where
tasks are abandoned, and where Back is pressed again at once, in normal Preview use, with no debug
capture on. At mila-hebrew.netlify.app/debug.html → Usage (admins, own account).
- Phone (`lib/usage.ts`): always on while signed in, names and timings only. `nav` for every
  screen change (from, how: push, back, replace; time on the screen before, minus time in the
  background; `after`, the control that caused it, so Done isn't taken for Back); `offer`, a surface
  shown with the controls it had (a drawer per lookup, a sheet each time it opens, a screen each
  visit; Details joins the drawer's offer once there is an explanation with details); `pick`, a
  control used; `outcome` (camera: opened reader, no text, read failed). Surfaces: Home, Read sheet,
  camera, Reader toolbar, sentence bar, word drawer (reader and study), Study's top bar, settings,
  Welcome back and round end, Your words. Sent with the study events; the server keeps them in
  `usageEvents` (cleared with the account), so Learning Insights and the learner model never read
  them (tested in study-events.test.ts).
- Viewer (`public/debug-usage.js`, analysis in `public/usage-analysis.js`, tested): when tracking
  began and what is covered; controls with "used in k of n showings", sortable by uses or share, so
  one never used shows as 0 of n; backtracks: every way a screen was arrived at, with how many were
  left by Back within an adjustable cutoff (3 s to start) and every arrival's time; Home → Read:
  what was offered and chosen, dismissed, and what led to reading; tasks left unfinished (camera,
  Paste text). Each row opens examples: the session as recorded, around the moment.
- **v2** (2026-11-26):
  - Screen changes fixed. v1 read `useRootNavigationState()`, a snapshot that never updates, so it
    saw only the launch (one session: 2 screen changes over Reader, Study, Your words and a word
    page). Now from the navigation container's `state` and `__unsafe_action__` events, compared
    as stacks in `lib/nav-change.ts` (tested): push, back, replace, or `unknown` with how many
    screens went and came; the launch's key settling is no longer a change. Marked `nv: 2`; v1
    sessions are left out of everything worked out from screen changes.
  - Coverage: Library, word page, Account (check for updates and its outcome, debug capture start
    and stop, Learning Insights), Paste text, Import; taps on words in the Reader and on cards;
    Home's Study with what it offered. `seen`: a developer panel on Account scrolled into view, not
    acted on; `offer.by`: the pick that brought a panel up. A control counts as offered only while
    usable (Capture and Live wait for the camera).
  - Viewer: a check of screen changes against where surfaces appeared; patterns ranked by count,
    each as steps with its share of comparable visits: quick reversals, detours, retries, panels
    closed at once or left unused, screens left untouched, tasks left, and recurring 2–4 step paths
    found without being asked for; panels by what was done with each showing.
- **Not yet:** controls on All forms, Root, Learning Insights and the password forms; answers on
  cards (they are study events); other accounts.

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
