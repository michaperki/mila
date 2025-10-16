
---

## 🔹 Problem Summary

* The **“Words” section** shows the *entire sentence* instead of a single target word.
* The learner cannot easily tell *which* word is currently under review.
* The layout visually duplicates content (“Words:” + full sentence again).
* There’s no **context mini-map** that situates the word within the sentence in a glanceable way.

---

## ✅ Goals for Redesign

1. **Highlight the active word clearly**
2. **Keep sentence context visible but secondary**
3. **Reduce redundancy and visual noise**
4. **Support quick navigation through words**

---

## 🔸 Proposed Layout (Revised Word View)

### 🧩 Structure

```
-----------------------------------------------------
Sentence 1 of 23
[ ו נניח שעכשיו אני מת, או פותח מכבסה בשירות עצמי, הראשונה בארץ ]
-----------------------------------------------------

🟦 Word Focus
כַּבֶּסָה  |  Laundromat
-------------------------------------
Part of Speech: Noun (fem.)
Root: כ־ב־ס
Audio 🔊  Add to Vocab ⭐

Context:
ו נניח שעכשיו אני מת, או פותח [מכבסה] בשירות עצמי, הראשונה בארץ
-----------------------------------------------------
Navigation:  ◀ Previous word   |   Next word ▶
-----------------------------------------------------
Translation:
And suppose I die now, or open a self-service laundromat, the first in the country.
```

---

## 🔸 Visual & Interaction Details

### **1️⃣ Word Focus Card (Primary Visual Element)**

* Large, centered word in **bold + Nikud**, e.g., `מכבּסה`
* Below it: English gloss, POS, root (optional line for advanced learners)
* Include **audio icon** and **add-to-vocab button** inline
* Consider subtle animation (fade/slide) when switching words

```jsx
<Card className="p-4 text-center border-primary">
  <h2 className="text-3xl font-bold text-primary">מכבּסה</h2>
  <p className="text-lg text-secondary">laundromat</p>
  <div className="mt-2 flex justify-center gap-4">
    <Button size="icon">🔊</Button>
    <Button variant="outline">⭐ Add to Vocab</Button>
  </div>
</Card>
```

---

### **2️⃣ Mini-Map Context Sentence**

* Below the card, show the full Hebrew sentence in **smaller gray text**
* The current focus word appears **highlighted (bold or colored)** within the sentence
  → Provides location awareness without clutter.

---

### **3️⃣ Navigation Controls**

* Replace generic “Previous” / “Next” buttons with labeled or icon-based versions:
  `← Previous Word` / `Next Word →`
* Optionally support arrow-key navigation.

---

### **4️⃣ Translation Panel (Optional Toggle)**

* Keep full sentence translation below as secondary info.
* Add small toggle “Show Translation ⧉” to reduce clutter when drilling vocabulary.

---

## 🧭 Implementation Roadmap

| Priority | Change                                                        | Purpose                          |
| -------- | ------------------------------------------------------------- | -------------------------------- |
| ⭐⭐⭐      | Add **Word Focus Card** section                               | Gives user a clear visual anchor |
| ⭐⭐       | Replace “Words:” repeated sentence with **mini-map sentence** | Context with clarity             |
| ⭐⭐       | Highlight current word in sentence                            | Quick spatial understanding      |
| ⭐        | Add **POS, root, audio, vocab actions**                       | Enriches learning utility        |
| ⭐        | Improve “Next/Previous” UX                                    | Faster navigation                |

---

## 🧠 Summary

Right now, “Word View” is mechanically correct but cognitively heavy.
This redesign makes it **visually instructional** — the learner focuses on one item at a time while keeping a sense of progression and context.

---

