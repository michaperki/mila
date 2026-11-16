# Mila backlog and roadmap

The one place that says what Mila is working towards, what was done, what's left and what would move
each thing forward. Detailed research lives in the linked docs and commits; this file only points
to it. Read it before starting product work; update it in the same commit as the work (see
[Keeping this up to date](#keeping-this-up-to-date)).

Last reviewed: 2026-11-16 (help on English cards STUDY-4; vocabulary organisation VOCAB-2: taxonomy v1, themes in the word list, themes on save; VOCAB-1 proposals revised).

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
**Planned, P2.** Approved as part of Phase 1 (2026-11-14), kept separate from personalization.
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
**Planned, P2.** Familiar cards always rest a fixed 3 days, however well known. Mike wants the
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
- **The interaction:** press and hold an English word (not the card's own, marked one) and the Hebrew
  that says it, as the sentence writes it, shows in a bubble just above it while held. A tap still
  turns the card over. An English word Hebrew has no word of its own for says "No separate word in
  Hebrew"; one the card's own word says (a suffix on it) says "Part of the word you're recalling",
  so the answer never shows. The Hebrew words given are underlined on the answer side, where a tap
  opens them in the drawer to save. "Press and hold a word for its Hebrew" shows until the first hold.
- **Which English word is which Hebrew word:** new cards record it with their glosses (`t`, the
  writer's same call); older cards ask the sentence's quick meanings with its English
  (`sentence-glosses` with `translation`, about $0.007 once a sentence, kept for everyone; approved
  by Mike), on the first hold in that sentence, which then waits 2–3 s with a spinner. Matching is
  `lib/english-help.ts`.
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
