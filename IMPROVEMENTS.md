# Project ReadLearn: Feature and UX Improvement Ideas

This document outlines suggestions for improving the ReadLearn application, including new features, UX enhancements, and technical improvements.

## Overall UX Impressions

*   **Clarity:** The interface is clean and readable, with clear separation between scanning, recent texts, and reading views.
*   **Flow:** The transition from *upload → OCR result → word-level breakdown* is good but could be more guided and rewarding for users.
*   **Engagement:** Right now, it feels like a developer tool more than a learning experience — improving interaction flow, visual hierarchy, and microfeedback would help.

## UI / UX Improvements

### 1. Onboarding
*   **Onboarding Flow:** Create a simple, dismissible onboarding tour for first-time users to explain the OCR process and the reader interface.

### 2. Home Screen (Scan & Recent Texts)

*   **Combine scan + recent history visually:** Use a card layout like “Continue Reading” + “New Scan.”
*   **Thumbnails:** Show small image previews next to recent OCR texts to help recognition.
*   **Sorting/filter:** Add filters (e.g., “This Week”, “Starred Sentences”) or search by text fragment.
*   **Empty state:** Add a friendly message or example scan when no OCRs exist.

### 3. Text View Screen (Sentence Breakdown)

*   **Reading Flow:**
    *   Add a sentence carousel (swipe or arrow key navigation).
    *   Include progress indicator (“Sentence 1 of 12”).
*   **Highlight behavior:** When hovering/clicking a word, highlight it within the sentence.
*   **Visual clarity:** Make “Words | Phrases” toggles look more like tabs or segmented controls.
*   **Loading Skeletons:** Implement skeleton loaders for the `Reader` screen to provide visual feedback while OCR and translation are in progress.
*   **Offline Indicator:** Add a subtle UI element to indicate when the app is running in offline mode.
*   **Improved Error Handling:** Provide more descriptive and user-friendly error messages (e.g., if OCR fails to detect text, or if the translation API fails).

### 4. Word Card Section

*   **Hierarchy:** “Selected Word” should be at top with clear typography; root and translation grouped below.
*   **Add missing data gracefully:** Show “Root not found” with a link to “Suggest or lookup root.”
*   **Pronunciation feedback:** Add slow-speed playback, pitch accent, or native example audio.
*   **Quick quiz icon:** Star or flashcard-add button inline for speed.

### 5. Settings
*   **Dedicated Settings Page:** Create a `Settings` route to house toggles for Nikud, transliteration, and other preferences.

## Suggested New Features

### A. Learning Experience

*   ⭐ **Flashcard Integration:** Directly add selected words to spaced-repetition decks (with difficulty slider).
*   **TTS & Voice Practice:** Let users repeat after the app and compare pronunciation (browser speech recognition).
*   **Phrase Recognition:** Detect idioms and common expressions (e.g., על הדרך) automatically.
*   **Gamification:**
    *   **Streaks & Goals:** Encourage daily use by tracking consecutive days of study and allowing users to set goals (e.g., "read for 10 minutes a day").
    *   **Achievements:** Award badges for milestones (e.g., "first 100 words starred," "first book completed").
*   **Spaced Repetition System (SRS):**
    *   Integrate an SRS algorithm (e.g., a simple implementation of SM-2) into the `Vocab` screen to help users memorize vocabulary more effectively.

### B. Contextual Intelligence

*   **Auto-root recognition:** Integrate a Hebrew root-extraction library and display the shoresh visually (e.g., י־ר־ה).
*   **Smart segmentation:** Use NLP to split phrases (beyond whitespace) — “במכסה בשירות עצמי” → meaningful chunks.
*   **Context-aware translation:** Offer “literal” vs. “natural” translation toggles.
*   **Content Library:**
    *   Provide a small, curated library of public domain Hebrew texts (e.g., from Project Ben-Yehuda) to give users content to work with immediately, without needing to find their own images.

### C. User Journey & Retention

*   **Daily goal tracking:** “You read 3 sentences today!”
*   ️ **Tag by source:** Let users label scanned texts (e.g., “Poem,” “Menu,” “Book Page”).
*   **Review mode:** Later, show all previously starred words in one quiz session.
*   **User Accounts:**
    *   (Long-term) Add optional cloud-based user accounts to sync vocabulary and reading progress across devices.

## Technical Enhancements & Scaffolding

### Scaffolding for Expansion

You can plan these as modular components:

| Component          | Description                                          | Future Hook                                  |
| ------------------ | ---------------------------------------------------- | -------------------------------------------- |
| `SentenceViewer`   | Handles pagination, playback, and hover highlighting | Link to quiz generator                       |
| `WordDetailCard`   | Root, translation, and TTS                           | Extend to grammar/conjugation                |
| `FlashcardService` | API for adding words                                 | Sync with “Vocab” tab                        |
| `OCRManager`       | Handles text extraction, cleanup, segmentation       | Upgrade to serverless OCR or local Tesseract |

### Other Technical Enhancements
*   **Comprehensive Testing:** Add unit tests for the segmentation and state logic, and component tests for the UI.
*   **Accessibility (a11y):** Conduct an accessibility audit to ensure the app is usable for people with disabilities. This includes checking color contrast, keyboard navigation, and screen reader support.
*   **Performance Optimization:**
    *   **Code Splitting:** Implement route-based code splitting to reduce the initial bundle size.
    *   **Image Optimization:** Ensure that images are resized and compressed efficiently on the client-side before being processed by the OCR engine.

## v0 & v0.1 Implementation Roadmap

Based on the `README.md`, here are the next implementation steps:

*   **Full OCR Integration:** Wire the `ocr.worker.ts` to the `ImagePicker` and `ingest.ts` service.
*   **Segmentation Logic:** Implement the Hebrew-aware segmentation rules.
*   **"Real" Translation:** Implement the feature flag to switch between mock and real translation.
*   **Nikud & Transliteration:** Implement the UI toggles and logic.
*   **Web Speech TTS:** Implement Text-to-Speech functionality.
*   **PWA Install Prompt:** Implement the `InstallPrompt.tsx` component.
*   **Export/Import Vocab:** Add functionality to export and import the vocabulary list.
