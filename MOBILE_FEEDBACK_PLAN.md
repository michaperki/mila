# Mobile app — feedback plan (2026-10-07)

Combined review from two external models (Claude and GPT, each given two rounds of
screenshots: the main tabs, then the tap-a-word flow). Tags: **[C]** Claude, **[G]** GPT,
**[both]**. Status: `[ ]` todo · `[x]` done · `[~]` partial · `[-]` deferred.

**Product direction (both reviewers agree):** Mila is not "camera translation for Hebrew".
It is a layer over real-world Hebrew that turns what you're reading into a lesson. Translation
gets you unstuck; *understanding, saving, and remembering* what you saw is the product. The
tapped-word card is the center of the app.

**Home page?** Neither reviewer asked for one. Claude flagged live preview auto-starting
(privacy/battery); GPT wants the camera to be the main screen. Decision: keep launching on the
Camera tab, but don't start live preview until the user asks for it (the choice is remembered).
Revisit a Home tab once vocabulary review exists, because then it has real content: continue
reading, words due, capture.

---

## P0 — Correctness

- [x] **1. Translate the tapped word in context** [both]. בחשבון in "מבחן בחשבון" was shown as
  "in the calculator"; it means "in math/arithmetic". Send the whole sentence with the target word
  and get its meaning *in that sentence*. Drop the "may differ from its meaning" disclaimer.
  → New `word-analysis` function (Claude API, structured JSON). The client falls back to the
  old Google word translation if the function is unavailable.
- [x] **2. Passage mistranslation** [C]. חזרתי מבית הספר came out as "I studied hard" (correct:
  "I came back from school"). Cause: the whole OCR block went to Google as one string, with lines
  merged. → Translate segment by segment (see 3).
- [x] **3. OCR cleanup + structure** [both] → `apps/mobile/src/lib/ocr-cleanup.ts`, unit tested.
  - Drop page furniture: running headers/footers with page numbers ("טקסטים בעלי מילים ארוכות 33"),
    lone numbers at the page edges.
  - Strip stray glyphs (`◄`, `►`, bullets).
  - Normalize Latin `I.`/`l.`/`|.` list markers to `1.`. Keep list numbers out of translation
    so Google can't turn "1."→ו→"6.". Reattach the number afterwards.
  - Keep headings (e.g. the title "מבחן בחשבון") as their own segment instead of merging them into
    the first sentence. Join soft-wrapped lines, then split into sentences.
- [x] **4. "(tabs)" back-button label** [both]. Use the minimal (standard iOS) back affordance.
- [x] **5. Library preview cut mid-word** ("חָז") [C]. Truncate titles at a word boundary and add "…".

## P1 — UX friction

- [x] **6. Word card as a bottom sheet** [C], not below the English text, where it needs a full-screen scroll.
- [x] **7. Feedback states** [both]: spinner while "Reading Hebrew…". "Saved ✓" for passage and
  word. Words already in vocabulary show as saved, which prevents duplicates.
- [x] **8. Remove the oversized eyebrow/title headers** from Reader, Library, Vocabulary, Account [both].
  Keep them only for empty or signed-out states.
- [x] **9. Camera control hierarchy** [both]: one dominant round shutter. Live preview becomes a small
  toggle. Photo / Paste become small icon buttons (the olive buttons looked disabled).
- [x] **10. Blue gear button** [both]. This isn't in our code. It's the Expo dev-client tools
  button, which only appears in development builds. It won't show in preview/production builds;
  no code change needed.
- [x] **11. Live preview off by default; remember the choice** [C].
- [x] **12. Account**: Sign out moved to the bottom as a quiet text button. Privacy copy behind "Learn more" [C].

## P2 — Make the word card teach

- [x] **13. Morphology on the card** [both]: vocalized form, meaning in this sentence, prefix breakdown
  (בַּ + חֶשְׁבּוֹן), lemma + its general meaning, root, part of speech, binyan for verbs.
- [x] **14. Save words with their source sentence** (and its translation, lemma, root) [both].
  Vocabulary cards show the sentence.
- [x] **15. Line-by-line reading** [both]: each Hebrew segment is paired with its English, plus a
  "Hide English" toggle so the learner can try the Hebrew first [G]. Hebrew is smaller and reads
  like a passage [G].

## P3 — Learning system

- [-] **16. Vocabulary review / spaced repetition** [both]: cloze cards from the saved sentence
  ("מחר יש לי ___ בחשבון"). Needs 14 first. The web app already has `ReviewCard` types to reuse.
- [~] **17. Library metadata** [both]: English first line + date + segment count now. Search and
  filters (Recent / Books / Photos) later.

## P4 — Polish / future

- [~] **18. Word navigation** [C]: previous/next word buttons on the card now. Swipe gestures later.
  Speaker button to hear just the word [C]. Long-press for full analysis [G]: deferred.
- [x] **19. Niqqud on/off toggle** in the reader [C].
- [-] **20. Show what live preview is reading** (bounding boxes), later an AR interlinear overlay [G].
  Needs word/line geometry from Vision (`fullTextAnnotation.pages[].blocks`).

---

## Implementation notes

- **New server env var:** `ANTHROPIC_API_KEY` in Netlify for `word-analysis`. Without it the
  function returns 503 `ANALYSIS_CONFIG` and the app falls back to plain word translation.
- `word-analysis` requires sign-in (same as OCR), so anonymous traffic can't run up LLM cost.
- Saved documents now hold one chunk per segment. The web app already renders multi-chunk docs.
- Not yet verified: a live `word-analysis` call (no valid API key in the dev shell), and on-device
  behavior of the new camera controls and word sheet. Run the physical iPhone checklist in
  `apps/mobile/README.md`, plus: tap בחשבון in "מבחן בחשבון" and confirm "in math".
