# Mila Hebrew: OCR → Morphology → LLM Fallback Pipeline

> Goal: fix errors like **פחד → פח (“tin”)** by combining a fast local pipeline with a surgical GPT fallback for segmentation, lemma/POS, and sense disambiguation — while keeping costs low.

## TL;DR (Deploy Order)
1) **Local first**: OCR → tokenize → lexicon + rules → morph analyzer → confidence.  
2) **Escalate only when unsure**: single **batched per-sentence** GPT call returning strict JSON.  
3) **Cache** by normalized sentence; **log** user corrections; run **regression** on every change.

---

## Architecture

```
Capture → OCR (Tesseract/MT API) → Normalizer → Tokenizer
   → Lexicon Lookup (MILA/Wiktionary) + Heuristics
   → Morph Analyzer (YAP or hebrew-nlp)
   → Resolver (lemma/POS/senses + confidence)
   → [if low confidence] → GPT Disambiguator (JSON)
   → UI (glosses, alternatives, confidence) + Telemetry
```

### Key Principles
- Prefer **no-split** unless prefix removal yields a valid lemma or required clitic.
- Keep **one LLM call per sentence**, never per token.
- Keep prompts **compact**; return **JSON only**.
- Surface **alternatives** on low confidence; capture user choice as training data.

---

## Implementation Steps

### 1) OCR & Normalization
- Keep current sentence-level MT (your translations are already good).
- Normalize text pre-analysis:
  - Strip niqqud; normalize final letters; collapse whitespace; standardize maqaf.
  - Replace GERESH/GERSHAYIM with straight quotes for tokenizer stability.

```ts
// /packages/nlp/src/normalize.ts
export function normalizeHebrew(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u0591-\u05C7]/g, '') // diacritics
    .replace(/[״”]/g, '"').replace(/[׳’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
```

### 2) Tokenize
- Simple right-to-left tokenization with maqaf support; keep **start/end** offsets for UI alignment.
```ts
// /packages/nlp/src/tokenize.ts
export type Token = { text: string; start: number; end: number };
export function tokenizeHebrew(s: string): Token[] {
  const out: Token[] = [];
  let i = 0, j = 0;
  const push = () => { if (i < j) out.push({ text: s.slice(i, j), start: i, end: j }); i = j; };
  while (j <= s.length) {
    const ch = s[j] || ' ';
    if (/\s/.test(ch)) { push(); j++; i = j; continue; }
    if (/[-–־]/.test(ch)) { j++; continue; } // keep maqaf inside token
    j++;
  }
  return out;
}
```

### 3) Prefix/Suffix Heuristics (Local)
- Handle {ו, ב, כ, ל, מ, ש, ה} and combos. Prefer no-split if stem < 3 letters.
- Special-case **מ-**: treat as “from” **only** if stem is a known lemma **or** governed by a verb that selects “מ-”.

```ts
// /packages/nlp/src/morph_rules.ts
const PREFIXES = ['וש', 'שה', 'וה', 'ומ', 'מש', 'מ', 'ו', 'ב', 'כ', 'ל', 'ש', 'ה'] as const;
export type Morpheme = { form: string; type: 'prefix'|'stem'|'suffix'; lemma?: string; gloss?: string };

export function proposeSplits(token: string, isKnownLemma: (x:string)=>boolean): Morpheme[][] {
  const proposals: Morpheme[][] = [[{ form: token, type: 'stem' }]]; // no-split baseline
  for (const p of PREFIXES) {
    if (token.startsWith(p) && token.length - p.length >= 3) {
      const stem = token.slice(p.length);
      if (isKnownLemma(stem)) {
        proposals.push([{ form: p, type: 'prefix' }, { form: stem, type: 'stem' }]);
      }
    }
  }
  return proposals;
}
```

### 4) Lexicon + Morph Analyzer
- Use **MILA** or **hebrew-nlp** lexicon; wire **YAP** (or hebrew-nlp sequence tagger) for lemma+POS.
- Adapter returns candidates with scores.

```ts
// /packages/nlp/src/analyze.ts
export type MorphCandidate = { lemma: string; pos: string; binyan?: string; score: number };
export async function analyzeLocally(token: string): Promise<MorphCandidate[]> {
  // 1) lexicon hit(s)
  // 2) YAP/hebrew-nlp inference
  // 3) combine + normalize to scores in [0,1]
  return [];
}
```

### 5) Resolver & Confidence
- Merge: (rules confidence) × (analyzer score) × (lexicon hit quality).
- Set **thresholds**, e.g. `low < 0.55`, `medium 0.55–0.8`, `high ≥ 0.8`.
- Only **low** triggers LLM; **medium** shows alternatives.

```ts
export type TokenAnalysis = {
  token: string; start: number; end: number;
  lemma: string; pos: string; binyan?: string;
  sense_en: string; confidence: number;
  alternatives?: Array<{ lemma: string; pos: string; sense_en: string; confidence: number }>;
  morphemes?: Morpheme[];
  source: 'local'|'llm';
};
```

### 6) GPT Disambiguator (On-Demand)
- **One call per sentence**, JSON-only, compact prompt.
- Batch tokens with `confidence < 0.55` or analyzer disagreement.

**Prompt (template):**
```
You are a Hebrew morphologist. Analyze this sentence and the listed tokens.
Return ONLY JSON: [{token,start,end,morphemes:[{form,type,lemma,gloss}], lemma, pos, binyan, sense_en, alternatives:[{lemma,pos,sense_en}], confidence}].
Prefer no-split unless the remaining stem is a valid lemma or the context requires a clitic.
Sentence: "{{SENTENCE}}"
Tokens: {{TOKENS_JSON}}
```

**TypeScript client:**

```ts
// /packages/llm/src/gpt.ts
export async function llmDisambiguate(sentence: string, tokens: Token[]): Promise<TokenAnalysis[]> {
  const payload = {/* model, system+user messages as above */};
  // fetch to your LLM gateway; return parsed JSON
  return [];
}
```

**Cost Control**
- Cache by `sha1(normalize(sentence))`.
- Compact outputs (no explanations, short glosses).
- Use mid-tier model for read mode; top model for review.
- Batch multiple sentences when latency allows.

### 7) UI & Feedback
- For each token:
  - Show **gloss** + POS + lemma. If confidence < 0.8, show **alternatives** (& radio choice).
  - When user selects an alternative, log `{sentence_hash, token_span, chosen_lemma}`.
- Highlight tokens from **LLM** with a subtle badge; store both local and LLM results for audits.

### 8) Telemetry & Regression
- Add an integration test set (`/tests/fixtures/regression.jsonl`) including the **פחד** case and prefix pitfalls with **מ-**.
- GitHub Action runs the pipeline and compares JSON outputs (allow tiny numeric drift).

```json
// regression.jsonl (example record)
{
  "sentence": "וא יכול היה לעקוב אחריה, אבל העדיף לחכות, אולי פחד מדי ממה שיגלה",
  "expect": [{"span":[42,46],"lemma":"פחד","pos":"VERB","sense_en":"was afraid"}]
}
```

---

## API Surface (Server)

### POST `/api/analyze`
Input:
```json
{"sentence":"...", "tokens":[{"text":"...", "start":0, "end":3}], "llm_ok":true}
```
Output:
```json
{"analyses":[ { "token":"...", "start":0, "end":3, "lemma":"...", "pos":"VERB", "sense_en":"...", "confidence":0.86, "morphemes":[...] } ]}
```

### POST `/api/feedback`
```json
{"sentence_hash":"...","start":0,"end":3,"chosen":{"lemma":"פחד","pos":"VERB"}}
```

---

## Packages & Deps

- `packages/nlp`: normalization, tokenize, morph rules, resolver.
- `packages/llm`: compact client to your GPT gateway.
- External: `hebrew-nlp` or YAP; MILA lexicon; optional MT API; hashing (`@noble/hashes`), zod/valibot for schema validation.

## Deployment Checklist

### Runtime dependencies

- **Hebrew NLP service** (preferred): provision credentials from your morphology provider and expose `HEBREW_NLP_BASIC` (Base64 of `email:password`, optional `HEBREW_NLP_ENDPOINT`).
- **LLM fallback**: set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, `OPENAI_API_BASE`). Defaults to `gpt-4o-mini`.
- These keys are consumed by Netlify functions:
  - `netlify/functions/nlp-analyze.ts`
  - `netlify/functions/nlp-disambiguate.ts`

### Local configuration

```ts
// /apps/web/src/config/nlp.ts
export const NLP_CONFIG = {
  lowThreshold: 0.55,
  midThreshold: 0.80,
  useLLM: true,
  cacheTTL: 90 * 24 * 3600, // seconds
};
```

> If either API key is missing the app will fall back to the heuristic analyser only.

---

## Checklist
- [ ] Normalize & tokenize with spans
- [ ] Prefix rules + lexicon probe
- [ ] Morph analyzer adapter (YAP/hebrew-nlp)
- [ ] Confidence resolver
- [ ] LLM fallback (per-sentence) with caching
- [ ] UI alternatives + feedback logging
- [ ] Regression suite & CI
- [ ] Telemetry dashboards for confidence, LLM hit-rate, and cost
