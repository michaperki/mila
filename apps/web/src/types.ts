export type ChunkType = 'sentence' | 'phrase';

export type Token = {
  idx: number;
  surface: string;
  lemma?: string;
  root?: string;
  gloss?: string;
  pos?: string;
};

export type Chunk = {
  id: string;
  type: ChunkType;
  text: string;
  tokens: Token[];
  translation?: string;
  // Set by the mobile app for pages read with their layout: this chunk starts a paragraph,
  // and whether its sentence was cut at the page edge or joined across pages.
  paragraph?: boolean;
  joined?: boolean;
  cutStart?: boolean;
  cutEnd?: boolean;
};

export type TextDoc = {
  id: string;
  source: 'ocr';
  title?: string;
  chunks: Chunk[];
  createdAt: number;
  thumbnail?: string;
  // 'page': read from a photographed page with its paragraphs kept (mobile app).
  layout?: 'page';
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
