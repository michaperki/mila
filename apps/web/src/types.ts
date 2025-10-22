export type ChunkType = 'sentence' | 'phrase';

export type Token = {
  idx: number;
  surface: string;
  lemma?: string;
  root?: string;
  gloss?: string;
  pos?: string;
  sense?: string;
  analysisConfidence?: number;
  analysisSource?: 'local' | 'llm';
  alternatives?: Array<{ lemma: string; gloss?: string }>;
};

export type Chunk = {
  id: string;
  type: ChunkType;
  text: string;
  tokens: Token[];
  translation?: string;
};

export type TextDoc = {
  id: string;
  source: 'ocr';
  title?: string;
  chunks: Chunk[];
  createdAt: number;
  thumbnail?: string;
};

export type StarredItem = {
  id: string;
  lemma: string;
  gloss: string;
  root?: string;
  sourceRef?: { textId: string; chunkId: string };
  createdAt: number;
  frequency?: number;
};

export type ReviewRating = 1 | 2 | 3 | 4;

export type ReviewCard = {
  id: string;
  lemma: string;
  gloss: string;
  root?: string;
  createdAt: number;
  due: number;
  interval: number;
  ease: number;
  streak: number;
  lapses: number;
  lastReviewedAt?: number;
  sourceRef?: { textId: string; chunkId: string };
};
