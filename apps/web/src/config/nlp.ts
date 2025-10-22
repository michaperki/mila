export const NLP_CONFIG = {
  lowThreshold: 0.55,
  midThreshold: 0.8,
  useLLM: true,
  cacheTTL: 90 * 24 * 60 * 60, // 90 days in seconds
}

export type NlpConfig = typeof NLP_CONFIG
