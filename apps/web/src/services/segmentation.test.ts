import { describe, it, expect } from 'vitest';
import { segmentText } from './segmentation';

describe('Hebrew segmentation clitic detection', () => {
  it('keeps simple words starting with mem as single tokens', () => {
    const chunks = segmentText('מילה');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.tokens).toHaveLength(1);
    expect(chunks[0]?.tokens[0]?.surface).toBe('מילה');
  });

  it('keeps simple words starting with shin as single tokens', () => {
    const chunks = segmentText('שירה');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.tokens).toHaveLength(1);
    expect(chunks[0]?.tokens[0]?.surface).toBe('שירה');
  });

  it('splits clear mem prefix when followed by article', () => {
    const chunks = segmentText('מהבית');
    expect(chunks[0]?.tokens?.map(token => token.surface)).toEqual(['מ', 'הבית']);
  });

  it('splits shin prefix for conjugated verb', () => {
    const chunks = segmentText('שכתבתי');
    expect(chunks[0]?.tokens?.map(token => token.surface)).toEqual(['ש', 'כתבתי']);
  });

  it('does not split indefinite pronouns beginning with mem', () => {
    const chunks = segmentText('מישהו');
    expect(chunks[0]?.tokens).toHaveLength(1);
    expect(chunks[0]?.tokens[0]?.surface).toBe('מישהו');
  });

  it('does not split indefinite pronouns beginning with shin', () => {
    const chunks = segmentText('שום');
    expect(chunks[0]?.tokens).toHaveLength(1);
    expect(chunks[0]?.tokens[0]?.surface).toBe('שום');
  });
});
