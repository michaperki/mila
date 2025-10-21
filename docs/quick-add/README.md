# Quick Add Assistants

## Purpose
Manual entry should feel as smart as Mila’s automated captures. The UX spec calls for live suggestions, automatic language/root detection, and instant previews before saving. This readme outlines the assistance layer we layer onto the Home screen’s quick add surface.

## Solution Overview
- Introduce a `useLexicon` hook that loads a lightweight, client-side dictionary (bundled JSON) with lemmas, translations, pronunciations, and roots.
- As the user types, detect script/language and surface ranked suggestions that match the lemma or gloss.
- When a suggestion is chosen (or when the lemma looks Hebrew), run `suggestRoot`:
  - Prefer lexicon metadata.
  - Fall back to heuristic stripping of prefixes/suffixes and nikud removal.
- Display a preview pill showing translation, pronunciation, and detected root; the user can accept or override each field.
- Persist the confirmed root alongside the lemma/gloss when creating the `StarredItem`.

## UX Flow
1. User types (or dictates) a lemma.
2. Suggestions appear below the input; keyboard navigation and tap both work.
3. Selecting a suggestion fills gloss + pronunciation and locks in the root.
4. Pronunciation preview button triggers browser TTS (`SpeechSynthesis`) using the lemma.
5. Saving writes lemma, gloss, detected root, and metadata and queues the card for review.

## Implementation Notes
- The lexicon is small and ships with the app; it can be swapped for a larger dataset later.
- Inputs remain editable; overrides simply update the pending state, including the root.
- Validation ensures we never save without lemma/gloss; root is optional but encouraged and shown to the user.
- Voice capture path integrates with the same suggestion + preview pipeline.

## Future Enhancements
- Allow importing additional dictionary packs.
- Cache suggestion history tailored to the user.
- Provide deeper pronunciation (audio waveform) downloads when offline support improves.
