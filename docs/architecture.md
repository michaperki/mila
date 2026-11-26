# How Mila works

What runs where, what calls an AI, what is kept and who decides what. For developers and future
sessions: read it before adding an AI call, a background job or a new kind of stored content, and
update it in the same commit. Numbers were measured on 2026-11-15 with `apps/web/scripts/ai-report.mjs`
(last 30 days); rerun it rather than trusting them later. The roadmap is [backlog.md](backlog.md).

## Shape

- **Phone app** (`apps/mobile`, Expo): every screen, and every teaching decision. It keeps the
  saved words in memory (`state/vocab.ts`), the round in progress and the study log on the device.
- **Netlify functions** (`apps/web/netlify/functions`): sign-in, saved words, and every call to
  an AI or other paid service. One MongoDB database (`mila`).
- `apps/web/src` is the old web app, no longer used.

## Four responsibilities and where they live

| Responsibility | Where | How well separated |
|---|---|---|
| **Learner state**: what is known, how well, which way round | Phone: each card's `results`/`primed`/`on`/`seen` and the rules on them (`lib/forms.ts` `ProgressRules`, `cardState`). Server: the event model (`lib/learner.ts`, measured only) and the evidence profile for the writer (`lib/profile.ts`) | Good, with one duplication: Study's "familiar" rule is written twice, on the phone (`cardState`) and on the server (`profile.ts` steady). Change both together. |
| **Teaching decisions**: which words, which cards, which sentence, which exercise, when to write more | Phone, pure functions in `lib/forms.ts`: `intakeOrder`, `studyPool`, `deckOf`, `followUps`, `spread`, `sentenceFor`, `wantsSentence`, `exerciseOf`. Each returns its reason, and the reason is logged. | Good: pure, tested, and they read learner state rather than prompts. `forms.ts` is long and mixes all three phone-side concerns. Split it when it's next worked on heavily, not before. |
| **Content generation**: cards, new sentences, explanations, glosses, tables | Server: `lib/forms-writer.ts` + `word-forms.ts`, `word-analysis.ts`, `sentence-glosses.ts`, `word-table.ts`, `root-family.ts`, `lib/page-read.ts`, `speech.ts` | Good. What the writer knows about the learner arrives as one text block (`profileBlock`), so a better learner model changes that block, not the prompts or the UI. Teaching reasons (`why`) are stored with what they asked for, but not yet given to the writer. |
| **Delivery and persistence**: fetch, reuse, merge, retry | Phone: `lib/word-forms.ts` (`ensureForms`, `freshSentences`, shared in-flight), `lib/recognition.ts` (explanations, glosses, translations), `lib/speech.ts` (clips on disk), `state/vocab.ts`. Server: `lib/ai-cache.ts`, `lib/ai-usage.ts` (costs, daily cap) | Mostly good. The weak spot is `practice.tsx`, which also orchestrates writing ahead (`prepareAhead`, `varyAhead`) and merging results into its own copy of the words. Move that into `lib/word-forms.ts` when Study is next reworked. |

## Workflows

"Waits" means the learner sees a spinner until it's done.

| Workflow | On the phone | Network and AI | Waits? |
|---|---|---|---|
| **Photograph a page** | camera, crop | `mobile-ocr`: Google Vision (≈0.4 s, $0.0015), then `page-read`: Claude reads, corrects and translates the page (≈16 s, $0.057). `texts` saves it. | Yes, the page read. The single most expensive call, but rare (17 in 30 days). |
| **Select a sentence** | highlight, English shown | `sentence-glosses`: quick meanings for its words (≈2.7 s, $0.006). Cached for every learner by sentence (`aiCache`): 30% of requests are hits. The next sentence's are fetched once this one's arrive. | No: meanings fill in. |
| **Tap a word (Reader)** | drawer opens with the quick meaning | `word-analysis`: the full explanation (≈4.4 s, $0.014). Cached by word + sentence, on the phone and in `aiCache`, but almost never repeated (5 hits in 802). **Half of all AI spend.** | Details wait; the quick meaning doesn't. |
| **Tap a word (Study card)** | the card's own gloss at once | nothing, unless More or Save asks for the explanation | No |
| **Hold an English word (card shown in English)** | the Hebrew for it on one line under the sentence, until the next hold or the card is turned over (`lib/english-help.ts`) | nothing: the card's glosses say which English words each Hebrew word is. Only for a card not yet prepared, `card-words` for that sentence (`card-words-now`, rare) | No |
| **Open Study: card word data** | — | in the background, `card-words` for the round's older cards without it, then the other cards of its words an answer may bring in (`mayFollow`), two at a time, kept on the card (≈$0.007 a sentence, once) | No |
| **Save a word** | "Saved ✓" at once | waits for the explanation (shared with the tap), then `vocab` POST adds the encounter, with its explanation, to the entry. The explanation also gives the word's themes and register, kept only where the word has none yet | No (it finishes even if the drawer closes) |
| **Open Study** | the cached words, the saved round, or a new deck (`deckOf`) | `vocab` GET only if nothing is cached. Then, in the background, `word-forms` for the round's words and those coming up next that lack cards (`upcoming`: about 18 started and 6 new), and new sentences (`varyAhead`). | Only when no card is ready at all |
| **Answer a card** | result recorded locally, next card | the card's whole record goes into the result outbox (`lib/results.ts`, a file on the phone) and is sent at once: `vocab` PATCH, kept by the server only if no older than what it has. A stage it opens has its cards written. Study events are queued on the phone and sent on end, leave or background. | No |
| **Back up, export for an AI, import** (Account → Saved words) | share sheet; Import changes screen | `data`: a backup of everything kept for the account, or a task's words with instructions (no AI call); an import is checked row by row, previewed, applied, and can be undone (`imports`) | Only for the file or preview |
| **Listen** | clip from disk if kept | `speech`: Gemini or ElevenLabs, with Claude adding vowels first (≈1–2 s, <$0.001). Clips are kept on the device. The next sentence's clip is prefetched only while listening. | Yes, the first time |
| **Word page, tables, roots** | cached words | `word-forms` for missing stages; `word-table`, `root-family` (cached in `aiCache`) | Tables and roots, yes |

## AI requests (30 days to 2026-11-15, $21.65 in all, one active learner)

| Feature | Model | Trigger | Calls | Cost | p50 / p90 | Cached how |
|---|---|---|---|---|---|---|
| `word` explanation | Opus 5.5, low effort | Reader tap; More/Save on a card | 797 | $11.06 | 4.4 / 6.1 s | prompt cache (system); `aiCache` by word + sentence. Since 2026-11-16 it also gives themes and register (about $0.0006 more a call) |
| `forms` cards | Opus 5.5, low effort | Study writing ahead, a stage opened, word page | 769 | $7.48 | 3.9 / 6.7 s | prompt cache; stored on the word, written once per stage |
| `glosses` | Opus 5.5 | sentence selected | 317 + 136 hits | $1.91 | 2.7 / 4.1 s | `aiCache` by sentence |
| `page` | Opus 5.5 | photo | 17 | $0.98 | 16 / 19 s | none (each page is new) |
| `variation` new sentences | Opus 5.5, low effort | `wantsSentence`, New sentences button | 0 so far | — | — | stored on the card; ≤16 calls a day |
| translate, ocr, speech | Google, ElevenLabs, Sonnet | fallbacks, photo, Listen | 152 | $0.22 | 0.3–2 s | speech clips on the device |

- **Every learner's day is capped** at $3 (`AI_DAILY_LIMIT_USD`, `checkDailySpend`).
- **Every paid call is logged** in `aiUsage` with its cost, latency and tokens; answers served from `aiCache` are logged too, at no cost.

## Generated content: where it lives and when it's made again

| Content | Stored | Shared? | Made again when |
|---|---|---|---|
| Cards (`forms`) | on the learner's word (`vocab.forms`) | no | never; only a missing stage is written |
| New sentences | on the card (`forms[].variants`, with `writer`, `support`, `why`, `at`) | no | `wantsSentence` asks; at most 4 sentences a card, one a day |
| Explanations | `aiCache` (every learner), and a copy on each encounter saved | yes | the cache kind's version changes (old versions stay, unused) |
| Glosses, tables, roots | `aiCache` | yes | as above |
| Speech clips | the phone's cache directory | no | the clip is missing |
| Page reads | `texts` | no | never |
| Organisation (themes, register, level) | on the learner's word (`categories`, `register`, `level`, `taxonomy`), set by the save's explanation or an import; level otherwise from `rank` on the phone | no | an import, or a new taxonomy version (the classify export offers those words again) |

## Background work: failures, leaving, overlap

- **Card writing** (`ensureForms`) and **new sentences** (`freshSentences`):
  - Requests for the same word and stage while one is on its way share it (`lib/shared.ts`), so overlapping triggers pay once.
  - The server won't store a stage twice, or more sentences than a card's limit.
  - Leaving Study doesn't cancel a request. Its result goes into the shared saved words when it lands, or is simply fetched next time.
  - A failed stage is asked for again the next time it's needed. Nothing retries in a loop.
- **Unverified:** card writing is 2–3 model calls in one function request. Netlify's function time limit isn't set in `netlify.toml`, so check the site's setting before adding more steps to one request.
- **The word list** is fetched when there is nothing cached, and on a screen visit only if it's more than 2 minutes old. Every change made in the app is applied to the cached copy as it's sent.
- **Results** (`lib/results.ts`, `lib/result-queue.ts`):
  - Each answer's update is the card's whole record, kept in a file on the phone until the server has it.
  - Only the newest update per card waits; changing an answer replaces the older one.
  - It is sent at once, and again when Study opens, when the words are fetched and when Mila comes back or leaves. Offline, it waits; a refused update (400) is let go; a deleted word counts as done.
  - The server keeps a record only if it's no older than the one stored (`last`), so a repeat changes nothing and a late older one is ignored.
  - Words fetched while updates wait are shown with them laid over, so a refresh never undoes an answer.
  - The study log stays the record of what happened. The outbox only carries the card's state to the server.
- **Study events** queue on the phone and are sent on end, leave and background.

## Principles

1. **Decide on the phone, generate on the server, store with the learner.**
   - Teaching decisions are pure functions over learner state, and return a reason that is logged.
   - Generation is a server call that never decides what to teach.
2. **Generate when a decision needs it, never in bulk.**
   - Write ahead only for what the next round will show.
   - Anything written for a reason keeps that reason.
3. **Reuse before generating.** Look for an answer in this order:
   1. the phone's own copy;
   2. `aiCache` (shared, versioned);
   3. content stored on the learner's word;
   4. only then the model.
4. **Nothing interactive waits on optional AI.** Show what is known at once, and fill in later. A tap waits only for what it asked for.
5. **One request per thing at a time.** Share in-flight requests on the phone. Make the server's write idempotent: conditional updates, limits in the filter.
6. **Every paid call is counted and capped.** It goes through `recordClaude` (or the provider's recorder) and `checkDailySpend`. Each feature has its own name in `aiUsage`.
7. **Learner understanding reaches generation as data** (`profileBlock`, `why`), never as new prompt branches or UI.
8. **Measure before optimizing.** `scripts/ai-report.mjs` for cost, latency, caches and content use; `study-events.mjs` and `personalize.mjs outcomes` for learning.

## Data in and out

- **Backup:** `data?export=backup` returns everything account deletion would clear (`vocab`, `texts`, `studyEvents`). The phone adds its unsent answers, unsent events and the round in progress.
- **Task exports:** `data?export=<task>` returns a task's words, with only the fields it reads plus instructions for an AI. Two tasks: `classify-v1` (themes, register, level; taxonomy v1 in `lib/taxonomy.ts`; only the words not organised with this version, 150 to a file, with `waiting` saying how many in all) and `normalize-v1` (dictionary form, meaning, part of speech, archive). The phone shares it as a file; nothing calls an AI.
- **Import:** `lib/data-tasks.ts planImport` checks every row once, for both preview and apply. It accepts only the task's fields, with valid values. It ignores read-only fields echoed back. It refuses a whole row that names anything else (results, cards, encounters, checkpoints can never be written), an unknown id, a repeat, or a new dictionary form saved already.
- **Apply and undo:** applying keeps each field's old value in `imports`. Undo restores a field only where it still holds what the import put there.
- **Archived words** stay in the database and the backup, but leave the word list and Study. Saving one again from reading brings it back.
- **Organisation** (VOCAB-2): the taxonomy is defined once on the server (`lib/taxonomy.ts`) and named on the phone (`lib/taxonomy.ts`, checked equal by a test). It describes words; it never decides. The word list filters by it, and teaching decisions that use it (intake, STUDY-3) read it through `themesOf` and `levelOf` as one signal among others.

## Developer tools

- **`scripts/ai-report.mjs [days] [email]`**:
  - requests by feature (calls, cost, latency, tokens, prompt cache);
  - cache writes after idle gaps;
  - Mila's answer cache by kind;
  - cards and new sentences written against those answered;
  - the size of the word list.

  Read-only.
- **`scripts/study-events.mjs`**, **`scripts/personalize.mjs outcomes`**, **`scripts/learner-dashboard.mjs`**: what was studied, and how.
- **Account → AI usage** (for admins): this month's spend by feature.
- **Account → Learning Insights** (for admins, `ADMIN_EMAILS`; `functions/insights.ts`, built in
  `lib/insights.ts`): your own sessions as Mila recorded them, event by event, with the evidence
  the learner model took from each (`Evidence.from`, learner-v1.4), a few named heuristics
  (observation → interpretation → opportunity → decision → outcome), one word's knowledge,
  importance and scheduling kept apart, and the model's predictions of recent answers against the
  card's own history. Read-only; predictions are kept per model version in `insightPredictions`
  (derived, safe to drop). Time spent is derived (`IDLE_MS` caps a gap, an `app` background event
  ends it), never logged as a duration of its own.

## Seeing what happens behind the scenes

A developer can record a debug capture in Mila Preview (Account → Debug capture) and read it on a
laptop at `/debug.html`: screen states, actions, requests, work done on the phone, server steps,
database operations and AI calls on one timeline, linked by the action that caused them. See
DEBUG-1 in the backlog. Outside a capture none of it runs.

Always on, by contrast: usage events (`lib/usage.ts`: screen changes, controls offered and used,
outcomes; names and timings only), read at `/debug.html` → Usage (DEBUG-2). They travel with the
study events but are kept in `usageEvents`, apart from `studyEvents`, so nothing that reads
learning (Insights, the learner model, scheduling) sees them.
