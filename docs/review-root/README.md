# Review Root Pipeline Refresh

## Purpose
Root drills in the spaced‑repetition flow need access to real lexical roots, but the current pipeline only keeps the chunk id. This document outlines how we persist and surface the actual root for every starred item so the `root` study mode can fulfill the Mila UX v0.9 goals.

## Solution Overview
- Extend `StarredItem` and `ReviewCard` with a `root` field (and keep it optional for backwards compatibility).
- Capture roots at the source:
  - Reader starring populates `root` from the tapped token.
  - Manual/quick add derives a suggested root from the lemma using lightweight heuristics and dictionary metadata.
- Keep review data in sync by updating the queue logic to read/write the new root field.
- Update UI copies so the root mode shows the stored root (and gracefully degrades if we still lack it).

## Data Flow Changes
1. **Source token** → `token.root` (already available from OCR pipeline when present).
2. **Reader** creates `StarredItem` `{ root: token.root }`.
3. **Quick add** uses the root suggester to seed the manual item.
4. **Vocab store** writes the root into IndexedDB and pushes it to the review store.
5. **Review store** moves the root onto the queued card; grading keeps it intact.

## Implementation Notes
- The `StarredItem` interface gains `root?: string`; migrations are not required because IndexedDB records store arbitrary keys.
- The `queueFromStarred` helper now copies `root` and updates existing cards if the root changes.
- Quick add will surface the detected root to the user before saving and persist their confirmation.
- The review screen’s root mode uses the stored value and no longer falls back to chunk ids.

## Stretch Follow-ups
- Add analytics to detect how often starring fails to include roots.
- Sync roots coming from batch imports.
- Consider enriching the root suggester with a more comprehensive morphology dataset.
