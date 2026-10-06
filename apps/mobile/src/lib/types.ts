// Use the same persisted document contract as the web client; imports are type-only.
export type { TextDoc, Chunk, Token, StarredItem } from '../../../web/src/types'
export type Session = { token: string; user: { id: string; email: string; tier: 'free' | 'premium'; createdAt: string } }
export type Recognition = { text: string; translation: string; capturedAt: number; imageUri?: string }
