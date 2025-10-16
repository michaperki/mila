# 📱 ReadLearn — UX & Feature Design Document (v0.2 → v1.0)

## 🔹 Core Navigation

### Bottom Tab Bar (4 Main Routes)
1. **📷 Camera**  
   - Launch photo capture or gallery upload.  
   - Immediately routes to **Current Translation** after OCR completes.

2. **📖 Current Translation**  
   - Displays most recent scanned text.  
   - Multiple sub-views: full text, sentence, phrase (future), word level.  
   - Navigation via arrows, swipes, or keyboard shortcuts.

3. **📜 List**  
   - Chronological list of all scanned/saved texts.  
   - Each entry includes title, thumbnail, and date.  
   - Clicking opens it in **Current Translation** view.

4. **⚙️ Settings**  
   - User preferences:  
     - Language direction (Hebrew→English or reverse)  
     - Theme (light/dark)  
     - Audio playback speed  
     - OCR options  
     - Storage management

---

## 🔹 Current Translation Views

| View | Description | Key Interactions |
|------|--------------|------------------|
| **Full Text** | Displays entire Hebrew text and translation. Toggle between Hebrew only, English only, or interlinear mode (translation directly below each Hebrew line). | Tap a Hebrew line → zoom to Sentence view. Toggle translation visibility. |
| **Sentence Level** | Focused view for one sentence. | Navigate with ← / → arrows. Play audio, add to vocab. |
| **Phrase Level** *(Stretch Goal)* | Highlights idioms and collocations within sentences. | Tap highlights to expand definitions and examples. |
| **Word Level** | Shows word transliteration, root (if available), meaning, and TTS. | Add to flashcard deck. Show related words. |

---

## 🔹 Display & Translation Modes
- **Display Toggles:**
  - Hebrew only  
  - English only  
  - Interlinear (hebrew + translation below)
- **Highlight Sync:** Clicking a Hebrew line highlights the corresponding English translation.
- **Audio Playback:** Per sentence or full passage.
- **Gesture Support:** Swipe to navigate between lines/sentences.

---

## 🔹 Supporting Systems

### OCR Pipeline
- Upload/capture → OCR text extraction → preview → confirm.
- Store source image + extracted text.
- Auto-index by date and title in the List view.

### Data Model
```ts
TextDocument {
  id: string
  imageUrl?: string
  ocrText: string
  translation: string
  sentences: Sentence[]
  createdAt: Date
}

Sentence {
  id: string
  text: string
  translation: string
  words: Word[]
}

Word {
  id: string
  text: string
  transliteration?: string
  root?: string
  meaning?: string
  starred?: boolean
}
```

---

## 🔹 UX Goals for Next Iteration
- Seamless flow from Camera → Current Translation.
- One-tap return to most recent document.
- Intuitive arrows and swipe gestures for sentence/word navigation.
- Consistent typography and white space; improve visual rhythm.
- Subtle feedback animations (e.g., highlight fade on word tap).

---

## 🔹 Feature Expansion Roadmap

### Phase 1 — UX Polish & Flow (v0.2)
- Implement bottom nav + tab transitions.
- Add interlinear translation mode.
- Introduce sentence-by-sentence navigation.
- Improve recent text list (thumbnail + titles).

### Phase 2 — Learning Layer (v0.3–v0.4)
- Flashcard integration for starred words.
- Audio playback per sentence & slow-speed option.
- Highlight active word/sentence.
- Add difficulty tracking or “learned” flag.

### Phase 3 — Smart Language Features (v0.5+)
- Automatic root (שורש) extraction and display.
- Phrase recognition (NLP chunking).
- Literal vs. natural translation toggle.
- Daily progress summary (“10 new words learned”).

---

## 🔹 Future-Ready Hooks
- 🧠 **Smart root/phrase detection** via local or cloud NLP.  
- ⭐ **Spaced Repetition System (SRS)** for flashcards.  
- 🔊 **Speech recognition & pronunciation scoring.**  
- 🕒 **Streak tracking and daily goals.**  
- ☁️ **Cloud sync** for multi-device continuity.

---

### Summary
This document defines a clear UX framework centered on **simplicity, progressive depth, and language immersion**. Each route in the bottom nav reinforces a core user goal: *capture text, study, review, and personalize learning.*  The system should feel natural, responsive, and rewarding to use — encouraging learners to interact daily.

