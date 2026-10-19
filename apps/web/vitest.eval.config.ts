import { defineConfig } from 'vitest/config'

// Evaluations call the real model and cost a little per run, so they only run on request:
// `npm run eval:phrases` (needs the Anthropic SDK installed and ANTHROPIC_API_KEY in the
// environment or apps/web/.env).
export default defineConfig({ test: { environment: 'node', include: ['tests/eval/**/*.eval.ts'], testTimeout: 600_000 } })
