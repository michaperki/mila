# Mila UI/UX Revamp Spec (v1)

**Goal:** Implement a simple, fast, and learner‑friendly interface for Hebrew OCR reading and vocabulary building. This spec consolidates our feedback into concrete, testable instructions.

---

## 1) Branding & Global
- **App name:** `Mila` (replace all “ReadLearn”).
- **Logo:** text lockup `מילה · Mila` (lightweight wordmark); keep icon optional.
- **Color system:**
  - Primary: `#2563EB` (blue-600). Hover `#1D4ED8`.
  - Surface: `#FFFFFF` (light), `#0B1020` (dark).
  - Text: `#0F172A` (light), `#E5E7EB` (dark).
  - Muted/Stroke: `#E2E8F0` light borders, `#1F2937` dark borders.
- **Typography:**
  - Hebrew & Latin: Inter (Latin) + "Noto Sans Hebrew".
  - Sizes: Title 22–24, Hebrew sentence 22–28, English sentence 18–20, annotations 14–16.
- **Spacing scale:** 8px base (8/12/16/20/24/32). Minimum tap target 44×44.
- **RTL/LTR:** global logical props (e.g., `margin-inline`, `text-align: center`).

---

## 2) Navigation Model
- Bottom nav (persistent): **Camera · Current · Vocab · Settings**.
- Active tab: primary tint + icon fill.
- **Default view after upload/select:** **Full Text** (remember last view per session).
- In `Current`, top segmented control: **Full Text | Sentence | Word**.
- Soft page titles: `Current`, small subtitle for context (e.g., `OCR Text 10/16/2025`).

---

## 3) Gestures & Controls
- **Horizontal swipe**:
  - Sentence view → previous/next sentence.
  - Word view → previous/next word.
- **Arrow buttons**:
  - Place **left/right floating arrows** centered vertically on the text card edges.
  - Direction: **Right arrow = Next**, **Left arrow = Previous**.
- **Progress chips**: `Sentence 1/23`, `Word 4/12` beneath header.

---

## 4) Screen Specifications

### A) Camera (Home)
**Purpose:** Ingest images and reopen recent texts.

**Header**: `Camera` with gear icon (global settings).

**Sections**
1. **Choose Image Source** (card)
   - Primary buttons: `Take Photo`, `Upload from Gallery`.
   - Helper text on supported formats & tips.
2. **Recent Texts** (list)
   - Item layout: thumbnail (left), title (first Hebrew words or user‑given title), meta (`23 sentences · Oct 16, 2025`).
   - Actions: overflow menu per item: `Open · Rename · Delete`.

**Empty state**: illustration + `Add your first text`.

**Acceptance**
- Tapping a recent item opens **Current → Full Text**.
- Deleting shows undo toast (5s).

---

### B) Current – Full Text (DEFAULT)
**Purpose:** Read the full passage with bilingual lines aligned.

**Layout**
- Segmented control: **Full Text | Sentence | Word**.
- Content is a vertical list of **paired blocks**; each block stacks **Hebrew (top)** and **English (bottom)**, both centered.
- **Equal font sizing** for Hebrew/English within a pair (Hebrew not smaller).
- Block max‑width 640px; `text-align:center`; generous line-height (1.5–1.6).
- Tap on any word → shows lightweight tooltip with translation + `⭐ Save`.
- Tap on a sentence → transitions to **Sentence** with that index.

**Options** (toolbar row above list)
- `Aᐩ / Aᐨ` text size.
- Toggles: `Show Nikud`, `Show Transliteration`, `Side‑by‑side / Stacked` (advanced; default **Stacked**).

**Acceptance**
- Hebrew/English baselines appear vertically centered and visually aligned; no left/right drift.
- Infinite scroll performs at 60fps with virtualization for long texts.

---

### C) Current – Sentence
**Purpose:** Focused view of a single sentence with clean hierarchy.

**Header**: `Sentence 1/23` + progress bar (0–100%).

**Card** (elevated)
- **Hebrew** (large, centered, RTL).
- **Transliteration** (muted gray, smaller).
- **English** (centered, LTR, same width).

**Controls**
- Floating arrows on left/right edges (next on right).
- Swipe left/right for navigation.
- `⭐` on any word via long‑press; hint: `Tap a word to view options`.

**Acceptance**
- Navigation feels immediate (<100ms perceived latency).
- Screen announces `Sentence x of y` to screen readers.

---

### D) Current – Word
**Purpose:** Deep dive on a word with context.

**Header**: `Word 4/12` (from the current sentence). Optional root icon.

**Main word card**
- Large **Hebrew word** centered.
- Below: **Transliteration**.
- Below: **Translation** (bold or strong).
- Root line: label `Root:` + 3‑letter root in monospaced or subtle style.
- Actions row: `🔊` audio, `⭐ Save`, `📋 Copy`.

**Context strip**
- Horizontally scrollable/swipable sentence preview with neighboring words.
- Focused word is bold; others muted. Clicking any word updates the main word.

**Navigation**
- Floating arrows at left/right edges (same as Sentence).

**Acceptance**
- Single‑letter tokens (e.g., conjunctions) remain understandable thanks to the context strip.
- Keyboard left/right also navigates on desktop.

---

### E) Vocab
**Purpose:** Manage saved words and review.

**Header**: `Vocabulary` with search.

**Filters**
- Sort: `Newest · Frequency · A→Z · Root`.
- Display toggles: `Show/Hide Nikud`, `Show Transliteration`.
- Source filter: `All texts` dropdown.

**Card layout** (per word)
- **Centered Hebrew** (large), English beneath (muted).
- Metadata: `Added Oct 16, 2025 · Seen 3× · From: OCR 10/16/2025`.
- Actions: `🔊` `Copy` `Remove` (compact secondary buttons).

**Bulk actions** (multi‑select): `Export CSV`, `Export Anki`, `Delete`.

**Review mode** (quick drills)
- Flashcard loop: show Hebrew → tap to reveal translation/root → mark `Known / Again`.

**Acceptance**
- Hebrew text visually centered within each card.
- Export produces well‑formed CSV with columns: `word, nikud, translit, translation, root, notes, source_id, added_at, seen_count`.

---

### F) Settings
- Toggles: `Dark Mode`, `Show Nikud by default`, `Show Transliteration by default`.
- Text size slider (persists).
- Data: `Manage Storage`, `Export All Vocab`, `Clear Recents`.
- About: version, acknowledgments, licenses.

---

## 5) Dark Mode
- Toggle in Settings; respect OS preference on first run.
- Surfaces flip to near‑black; keep **blue** accessible (WCAG AA).
- Cards remain slightly elevated with subtle borders; avoid pure #000 backgrounds under text.

---

## 6) Accessibility
- Minimum contrast 4.5:1 for text; 3:1 for large text.
- VoiceOver/Screen Reader labels:
  - Sentence view: announce indices and actions.
  - Word view: read Hebrew, then transliteration, then meaning.
- Focus order respects reading flow; arrows are reachable.
- Tap targets ≥44px; focus ring visible.

---

## 7) Micro‑interactions
- Transitions: 150–200ms fade/slide between Sentence↔Word.
- Save star: burst micro‑animation + toast `Saved to Vocab`.
- Delete confirmation: sheet + undo.

---

## 8) Components & Implementation Notes
- Segmented control → focus/hover states; use `aria-pressed`.
- Floating arrows → `position: sticky` within the card container on desktop; absolute on mobile.
- Context strip → scroll-snap with `scroll-snap-type: x mandatory`; center active chip.
- RTL support via logical CSS:
  ```css
  .pair { text-align: center; }
  .he { direction: rtl; }
  .en { direction: ltr; }
  .card { padding: 24px; border-radius: 16px; }
  ```
- Persist preferences in `localStorage` (theme, nikud, translit, text size, last view).

---

## 9) States & Errors
- OCR in progress: non-blocking loader + cancel.
- Empty views: friendly illustrations + primary action.
- Network/offline: banner with retry; offline reading still works if cached.

---

## 10) Performance
- Virtualize long lists in Full Text.
- Preload audio for visible words.
- Cache recent OCR texts and vocab.

---

## 11) QA / Acceptance Checklist
- [ ] Upload → lands on **Full Text**.
- [ ] Hebrew/English **stacked, centered**, equal visual weight.
- [ ] Sentence/Word navigation via **swipe** + **edge arrows** (right=next).
- [ ] Word view shows **context strip** and handles one‑letter tokens.
- [ ] Vocab cards have **centered Hebrew**; export works.
- [ ] Dark mode: legible, AA contrast.
- [ ] Settings persist across sessions.

---

## 12) Delivery Plan
1. **Foundations (1–2 days):** theming, typography, RTL utilities, dark mode switch.
2. **Current/Full Text (1 day):** paired blocks, stacked layout, taps.
3. **Sentence (0.5 day):** card, arrows, swipe, progress.
4. **Word (1 day):** main card, context strip, audio, save.
5. **Vocab (1 day):** cards, filters, export.
6. **Camera (0.5 day):** recents list with actions.
7. **Polish (0.5 day):** micro‑interactions, a11y audit, QA.

---

## 13) Example Pseudocode Snippets
**Stacked bilingual pair**
```tsx
<article className="pair">
  <p className="he text-2xl leading-relaxed">{hebrew}</p>
  <p className="en text-xl text-slate-600 mt-2">{english}</p>
</article>
```

**Word context strip**
```tsx
<div className="context overflow-x-auto snap-x flex gap-2 px-2">
  {tokens.map((t,i)=> (
    <button
      key={i}
      className={`snap-center px-2 py-1 rounded ${i===idx? 'font-bold' : 'opacity-60'}`}
      onClick={()=>setIdx(i)}
    >{t}</button>
  ))}
</div>
```

**Floating arrows**
```tsx
<button aria-label="Previous" className="nav-prev">◀</button>
<button aria-label="Next" className="nav-next">▶</button>
```

---

**This spec is the source of truth for the next build of Mila.** If anything is ambiguous, prefer the simplest option that preserves readability and speed.

