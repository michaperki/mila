# ReadLearn (Web PWA) — README for Claude Code v0

**Goal:** Mobile‑first **web app (React + Vite + PWA)** that runs great on phones. v0 lets users: import/take a photo → OCR (in‑browser) → segment (sentence/phrase/word) → flip through units with translations → star vocab to a local list. No backend required.

---

## Why Web‑First

* Works on iOS/Android/desktop via browser; installable as a PWA.
* Avoids Expo/mobile build friction on Windows.
* Can later wrap with **Capacitor** for app stores without major changes.

---

## Scope (v0)

* **Image input:** file upload + camera (`<input accept="image/*" capture="environment">`).
* **OCR:** **Tesseract.js** (WebAssembly) running in a Web Worker (hebrew traineddata).
* **Segmentation:** sentences → phrases → words (rule‑based, Hebrew‑aware).
* **Translations:** mock dictionary + simple sentence translator (deterministic for tests). **Optionally** wire a real adapter via a tiny proxy to **Google Cloud Translation API** for sentences and token glosses.
* **Vocab:** star lemmas; persist in **IndexedDB**.
* **UX:** RTL by default for source Hebrew; nikud toggle; transliteration toggle.

**Stretch (v0.1)**: Web Speech **TTS** (if `speechSynthesis` has he‑IL voice), in‑place token edit, clipboard text import.

---

## Tech Stack

* **Build:** Vite + React + TypeScript
* **State:** Zustand
* **Routing:** React Router
* **Storage:** IndexedDB via `idb` (tiny helper)
* **PWA:** Workbox plugin (Vite PWA) + manifest + service worker
* **OCR:** Tesseract.js with `lang/hebrew.traineddata` loaded at runtime
* **Translation (optional real):** Google Cloud Translation API **via a small serverless proxy** (to keep credentials off the client)
* **Testing:** Vitest + React Testing Library + Playwright (smoke e2e optional)

---

## Project Structure

```
apps/web
├─ public
│  ├─ favicon.svg
│  ├─ manifest.webmanifest
│  └─ ocr-models/heb.traineddata        # loaded at runtime
├─ src
│  ├─ app.css / theme.ts
│  ├─ main.tsx
│  ├─ routes
│  │  ├─ Home.tsx
│  │  ├─ Reader.tsx
│  │  └─ Vocab.tsx
│  ├─ components
│  │  ├─ ImagePicker.tsx
│  │  ├─ PhraseChips.tsx
│  │  ├─ FullTextDisplay.tsx
│  │  └─ BottomBar.tsx
│  ├─ state
│  │  ├─ useTextStore.ts
│  │  └─ useVocabStore.ts
│  ├─ services
│  │  ├─ ocr.worker.ts                  # Tesseract.js in Web Worker
│  │  ├─ ingest.ts                      # glue OCR→segments
│  │  └─ translate.ts                   # adapter: mock or real fetch('/api/translate')
│  ├─ lib
│  │  ├─ rtl.ts
│  │  ├─ nikud.ts
│  │  └─ translit.ts
│  └─ types.ts
├─ api                                  # serverless proxy (e.g., Vercel / Cloudflare / Netlify)
│  └─ translate.ts                      # calls Google Cloud Translation API
├─ index.html
├─ vite.config.ts
├─ package.json
└─ README.md (this)
```

---

## Types (authoritative v0)

```ts
export type ChunkType = 'sentence' | 'phrase';
export type Token = { idx: number; surface: string; lemma?: string; root?: string; gloss?: string };
export type Chunk = { id: string; type: ChunkType; text: string; tokens: Token[]; translation?: string };
export type TextDoc = { id: string; source: 'ocr'; title?: string; chunks: Chunk[]; createdAt: number };
export type StarredItem = { id: string; lemma: string; gloss: string; sourceRef?: { textId: string; chunkId: string }; createdAt: number };
```

---

## Hebrew‑Aware Segmentation (rules)

* Split sentences on `.?!…` and **large gaps** we detect from OCR line breaks.
* Split phrases on commas, maqaf `־`, and coordinating conjunctions.
* Tokenization: split clitics **ו־, ה־, ב־, כ־, ל־, מ־, ש־** into prefix + base; keep indices.
* Normalize zero‑width chars; preserve RTL; ensure `dir="rtl"` wrappers.

---

## OCR Worker (Tesseract.js)

* Run Tesseract in a dedicated **Web Worker** (`ocr.worker.ts`).
* Load `heb.traineddata` from `/public/ocr-models/` (cacheable by SW).
* Return blocks → lines → words with bbox; we only need text for v0, but keep bbox for future highlighting.

**Worker API**

```ts
// in main thread
const result = await ocr(imageBlob, { lang: 'heb' });
// returns { text: string, lines: string[] }
```

---

## Mock Translate

* `translateSentence(text)` → English string (simple lookup + fallback “—”).
* `glossTokens(tokens)` → array of short glosses by surface→gloss map.
* Keep it deterministic; if not found, return “—”.

---

## Real Translate (Google Cloud Translation API)

**Why a proxy?** You **must not** expose Google credentials in the browser. Route requests through a tiny serverless function.

### Endpoint contract (client → proxy)

`POST /api/translate`

```json
{
  "sourceLang": "he",
  "targetLang": "en",
  "sentences": ["אני גר בתל אביב."],
  "tokens": [["אני","גר","בתל","אביב"]]  // optional for per-token gloss
}
```

Response:

```json
{
  "sentenceTranslations": ["I live in Tel Aviv."],
  "tokenGlosses": [["I","live (m.sg.)","in","Tel Aviv"]]
}
```

### Serverless proxy (TypeScript example)

`apps/web/api/translate.ts`

```ts
// Vercel/Netlify/Cloudflare-compatible handler
import type { VercelRequest, VercelResponse } from '@vercel/node';

const GOOGLE_PROJECT_ID = process.env.GCLOUD_PROJECT_ID!;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!; // use service account or API key

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { sourceLang = 'he', targetLang = 'en', sentences = [], tokens = [] } = req.body || {};

  // Batch translate sentences via REST v2
  const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`;
  const body = {
    q: sentences,
    source: sourceLang,
    target: targetLang,
    format: 'text'
  };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await resp.json();
  const sentenceTranslations = json?.data?.translations?.map((t: any) => t.translatedText) ?? [];

  // Simple token glosses by individual calls or dictionary fallback (keep minimal in v0)
  const tokenGlosses = tokens.length ? tokens.map((arr: string[]) => arr.map(() => '—')) : undefined;

  res.json({ sentenceTranslations, tokenGlosses });
}
```

> You may switch to the **v3** Translation API for glossaries / AutoML models later. Keep the client contract the same.

### Client adapter (`src/services/translate.ts`)

```ts
export async function realTranslate(payload: {
  sourceLang: string; targetLang: string; sentences: string[]; tokens?: string[][];
}) {
  const resp = await fetch('/api/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error('translate failed');
  return resp.json() as Promise<{ sentenceTranslations: string[]; tokenGlosses?: string[][] }>; 
}
```

### ENV & Secrets

* `GOOGLE_API_KEY` or service account (prefer server-side env vars).
* `GCLOUD_PROJECT_ID` (optional for v2; required for v3).

### Cost Guardrails

* Batch sentences in a single request.
* Set **character caps** per session (e.g., 5k chars/day when on free plan).
* Cache recent requests in memory (client) and/or KV (edge) by `(text, lang)`.

### Privacy

* Send **only necessary text** and language codes; avoid storing user content in the proxy.
* Add a `X-Client-Id` header to rate-limit per device.

---

## State & Screens

### Home

* CTA: **Take/Upload Photo** (file input, mobile‑first styles).
* Recent texts list (from IndexedDB), tap to open Reader.

### Reader

* **Top:** sentence viewer (RTL) with **[Nikud] [Transliterate]** toggles.
* **Middle:** selectable **phrase chips** showing translation under selection.
* **Bottom:** mode switch **Words | Phrases** with **swipe/arrow** navigation; actions: ⭐, 🔊(optional), Copy.

### Vocab

* List of starred lemmas; filter/search; tap for details (future sense edit).

---

## Persistence (IndexedDB)

* `texts` store: `TextDoc` JSON by id.
* `vocab` store: `StarredItem` by id; de‑dupe by `(lemma)`.
* Add simple migration utility; expose `export`/`import` JSON in Settings (v0.1).

---

## PWA Setup

* `manifest.webmanifest`: name, icons, `display: standalone`, `start_url: /`.
* **Service Worker** via `vite-plugin-pwa`:

  * Precache app shell.
  * Runtime cache: `ocr-models/*` and images with stale‑while‑revalidate.
* Provide **Install PWA** prompt UI on Home.

---

## Windows + Phone Testing (important)

1. `pnpm i` → `pnpm dev -- --host` (or `npm run dev -- --host`)
2. Phone and PC on **same Wi‑Fi**. Visit the LAN IP shown by Vite.
3. For iOS camera access via file input, use HTTPS:

   * Add `vite-plugin-basic-ssl` and run `pnpm dev:https` to serve local HTTPS.
   * Or tunnel via `ngrok` for a quick https URL.
4. On the phone, **Add to Home Screen** to test PWA install.

---

## Commands

```bash
# create
pnpm create vite@latest readlearn-web -- --template react-ts
cd readlearn-web
pnpm i zustand idb tesseract.js react-router-dom vite-plugin-pwa vite-plugin-basic-ssl

# dev (http)
pnpm dev -- --host
# dev (https)
pnpm dev:https
# build
pnpm build && pnpm preview
```

`vite.config.ts` sketch:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate' }), basicSsl()],
  server: { host: true },
});
```

---

## Tasks for Claude Code (implement in order)

1. Scaffold Vite React TS app with Router, Zustand, IndexedDB helpers, RTL base CSS.
2. Implement **ImagePicker** (mobile camera friendly). Normalize image to max width 1600px client‑side before OCR.
3. Create **OCR Web Worker** using Tesseract.js; wire to `ingest.ts`.
4. Implement **segmentation** utilities and sample tests (clitic split, maqaf handling).
5. Build **Reader** UI (sentence viewer, phrase chips, word/phrase carousel).
6. Implement **mock translate** and wire to UI (sentence + token glosses).
7. Add **Vocab** store + screen with star/unstar + persistence.
8. Add **PWA** manifest + SW; ensure offline once loaded.
9. Add **HTTPS dev** path and doc the phone‑test flow.
10. **(Optional real)** Implement `/api/translate` proxy using Google Cloud Translation; add a feature flag `useRealTranslate` and swap adapter.

**Stretch (v0.1)**
11) Add **TTS** via `speechSynthesis` (choose `he-IL` voice if present).
12) Clipboard import flow; manual token edit; highlight by bbox.
13) Export/Import starred vocab JSON.

---

## Definition of Done (v0)

* On iPhone/Android browser, user can: upload/take photo → see sentences/phrases/words → view translations → star vocab, and install as PWA.
* Performance: First meaningful render < 2s on mid‑range phone with a small image; OCR completes < 5s for 1600px width.
* Works offline after first load; data persists in IndexedDB.

---

## Notes / Hebrew Rendering

* Use fonts that show nikud well (system defaults often OK; consider CSS `font-feature-settings`).
* Wrap RTL text with `<div dir="rtl">`; avoid mixing LTR gloss inside the same block unless carefully styled.
* Normalize zero‑width joiners; strip them before tokenization.

---

## Future Backend Hook

When ready: replace `ocr.worker` with server OCR for heavy pages and add `/translate` endpoint; keep current adapter interfaces so UI code stays unchanged.

### Expansion path (server)

* Swap the web proxy for a **Gateway API** with routes:

  * `POST /translate` → Google Cloud Translation v3 (or other provider).
  * `POST /ingest/ocr` → server OCR for heavy/curved pages.
  * `POST /study/add` → future SRS sync.
* Add caching (Redis/KV) and a **usage quota** layer per user.
