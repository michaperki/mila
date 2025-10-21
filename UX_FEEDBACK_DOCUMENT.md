

# 🧩 ReadLearn UX Feedback Document

**Date:** 2025-10-16
**Reviewers:** Mike Perkins & GPT-5
**Scope:** OCR → Sentence → Word → Vocabulary flow

---

## 🔷 1. Summary

ReadLearn’s current UI is clean and functional but suffers from poor **visual hierarchy**, **layout inefficiency**, and **RTL/LTR misalignment** that detract from readability and focus.
Menus dominate the page, while the learning content (Hebrew + translation) often feels secondary.
The redesign should prioritize *content visibility and alignment* while minimizing control clutter.

---

## 🔷 2. Major Issues (Cross-Cutting)

| Area                      | Problem                                                                                                | Suggested Fix                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Menu Size / Dominance** | Menu bars (“Hide Nikud,” “View Mode,” “Translation”) are oversized and take up ~30% of vertical space. | Reduce padding and font size by ~30–40%. Collapse advanced toggles into dropdown or slide-over panel. |
| **Content Hierarchy**     | “Word Focus” label and other headings overshadow the actual text.                                      | Make the Hebrew word (or sentence) the largest element. Labels in smaller, lighter text.              |
| **RTL / LTR Alignment**   | Hebrew and English appear on opposite sides of the container, breaking pairing.                        | Stack vertically or use mirrored flex layout: Hebrew (right-aligned) above English (left-aligned).    |
| **Empty Data Noise**      | Fields show “Not available” repeatedly.                                                                | Hide sections dynamically when data is missing.                                                       |
| **Context Display**       | The context line lacks word emphasis.                                                                  | Highlight current word in bold/color and slightly dim surrounding text.                               |

---

## 🔷 3. Page-Specific Feedback

### 📸 A. Scan & Recent Texts

**Issues**

* “Upload” copy is redundant with buttons.
* Recent Texts metadata (e.g. “23 sentences”) lacks visual hierarchy.
* No preview or context image shown.

**Fixes**

* Replace header text with concise “Choose Image Source.”
* Show small thumbnail of the scanned image next to each entry.
* Style metadata in muted gray beneath the title.

---

### 📖 B. Sentence View

**Issues**

* Layout feels balanced but navigation controls (Next/Previous Word) appear here unnecessarily.
* “Translation:” label is heavy and breaks flow.

**Fixes**

* Restrict word navigation buttons to Word View only.
* Inline the translation (no label) or use smaller muted heading.
* Add subtle sentence progress bar (e.g. “1 / 23”).

---

### 🔤 C. Word View

**Issues**

* The Hebrew word is tiny and off-screen (bottom right).
* “Word Focus” heading is the largest element instead of the target word.
* English translation is misaligned (far left).
* Menus push main content below the fold.

**Fixes**

1. **Center Layout:**

   ```
   מַיִם
   water
   [root: מים | part of speech: noun]
   ```

   Centered, large font, stacked vertically.
2. Shrink top menu height and group toggles logically (e.g., “Display Options” expandable section).
3. Remove “Word Focus” title or replace with subtle gray label above the word.
4. Context line should highlight selected word in bold or background tint.

---

### 🗂 D. Vocabulary Page

**Issues**

* Same LTR/RTL misalignment: Hebrew and English split across sides.
* Menu controls again dominate.
* Cards lack visual grouping and context hierarchy.

**Fixes**

* Stack Hebrew and English vertically (large Hebrew word on top).
* Add light card borders or alternating row backgrounds.
* “Source Context” in smaller gray text with ellipsis truncation.
* Add sorting/filter options (by date, alpha, frequency).
* Reduce top menu prominence; move export/import actions to secondary toolbar or modal.

---

## 🔷 4. Visual & Typographic Priorities

| Level         | Element                       | Font Weight / Size | Notes                          |
| ------------- | ----------------------------- | ------------------ | ------------------------------ |
| **Primary**   | Hebrew Word / Sentence        | 32–40 px, bold     | Center stage, highest contrast |
| **Secondary** | English Translation           | 24 px, medium      | Directly below Hebrew          |
| **Tertiary**  | Metadata (root, POS, context) | 16 px, gray        | Compact and consistent         |
| **Controls**  | Menus, buttons, labels        | 14–16 px           | Light background separation    |

Use subtle gray band or shadow to distinguish menus from reading area. Maintain consistent horizontal padding.

---

## 🔷 5. Implementation Priorities

1. **Fix Word View alignment (center + RTL/LTR stacking)**
2. **Reduce menu height and regroup controls**
3. **Redesign Vocabulary cards for readability**
4. **Apply consistent typography hierarchy across all modes**
5. **Hide unavailable metadata dynamically**

---
