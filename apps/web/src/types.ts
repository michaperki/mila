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
  sourceRef?: { textId: string; chunkId: string };
  createdAt: number;
  frequency?: number;
};
