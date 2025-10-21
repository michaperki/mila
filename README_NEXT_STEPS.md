# Mila Web App – Upcoming Updates Guide

This document captures the implementation plan for the next milestone. It focuses on the new functionality we discussed: deleting OCR entries, introducing accounts with persistent storage, designing the signed-out experience, and preparing a freemium pricing path. (Branch hygiene/merge steps are intentionally omitted.)

---

## 1. Delete OCR Entries (Library Hygiene)

### Current baseline
- OCR results are stored in IndexedDB via `useTextStore` (`texts` object store) and surfaced in routes like `Read.tsx`, `Reader.tsx`, and `Camera.tsx`.
- There is no delete affordance; entries accumulate indefinitely.

### Implementation outline
1. **State updates**
   - Extend `useTextStore` with `deleteText(id: string)` that removes the record from IndexedDB and updates in-memory state. Clear any related `useReviewStore` queues.
   - Add optional `thumbnail` cleanup if we later persist previews.
2. **UI affordances**
   - Library (`/read`) list: add `…` menu or swipe-to-delete (mobile). Confirm deletion via modal/toast.
   - `Reader` route: include “Delete capture” in the overflow menu (with confirmation).
   - After deletion while viewing a capture, navigate back to `/read`.
3. **Error handling**
   - Surface delete failures in the existing toast system.
   - Ensure deletion works offline and syncs when storage reconnects (once we add backend persistence).
4. **Testing**
   - Unit test `deleteText` in `useTextStore`.
   - Add Playwright smoke test that creates → deletes → confirms removal from list.

---

## 2. Accounts & Persistent Storage

### Goals
- Introduce user accounts so captures and vocab sync across devices.
- Move storage from purely IndexedDB to a cloud database (IndexedDB becomes a cache/offline layer).

### Proposed stack
| Concern | Recommendation |
|---------|----------------|
| Authentication | Netlify Identity or Auth0 (Netlify works nicely with existing deployment). |
| API surface | Netlify Functions in `apps/web/netlify/functions/` for CRUD and usage tracking. |
| Database | MongoDB Atlas free tier cluster. |
| ORM/driver | Official MongoDB Node driver (lightweight, works in functions). |

### Setup checklist
1. **MongoDB Atlas**
   - Create a shared cluster.
   - Whitelist Netlify build IP (or set “Allow access from anywhere” during dev).
   - Create database `mila` with collections: `users`, `texts`, `vocab`, `usage`, `payments`.
   - Generate app user and note connection string.
2. **Environment variables (Netlify & local dev)**
   ```
   MONGODB_URI=<atlas-connection-string>
   MONGODB_DB_NAME=mila
   JWT_SECRET=<random-32-bytes>             # if using custom auth flows
   NETLIFY_IDENTITY_URL=<https://.../.netlify/identity>  # optional if using Netlify Identity widget
   STRIPE_TEST_KEY=mock                      # placeholder for future billing hookup
   ```
   - Add the same values to local `.env` consumed by Vite and Netlify dev server (ensure secrets stay out of git).
3. **API modules**
   - `functions/auth.ts` (sign-up, login, refresh).
   - `functions/texts.ts` (list/create/delete OCR docs).
   - `functions/vocab.ts` (starred vocab sync).
   - `functions/usage.ts` (increment counters, enforce limits).
4. **Client integration**
   - Introduce an `AuthProvider` (context + Zustand slice) that stores JWT/refresh tokens, handles login, logout, silent refresh.
   - Wrap storage calls (`useTextStore`, `useVocabStore`) with network sync: on auth, pull remote data, on mutations write to both local cache and API.

---

## 3. Signed-Out (Guest) Experience

### Requirements
- Allow guests to try the camera once to understand the value.
- Block saving OCR results or vocab until they create an account.

### Feature design
1. **Usage flagging**
   - Track guest usage in local storage (`localStorage.guestCaptureUsed = true`).
   - The first capture runs as today; subsequent attempts show a gated dialog prompting sign-up.
2. **UI updates**
   - Add a banner in the camera route explaining “Create a free account to keep your captures”.
   - Use the existing toast system to warn when the guest limit is reached.
3. **Telemetry**
   - Log guest interactions (Netlify function call or analytics event) so we can monitor conversion later.
4. **Edge cases**
   - When the guest signs up mid-session, migrate the last capture to their new account (after backend integration).

---

## 4. Freemium Limits & Mocked Billing

### Goal
- Introduce a quota: signed-in users can process 5 captures for free before upgrading.
- Mock the billing flow during development so nobody is blocked.

### Implementation plan
1. **Usage accounting**
   - On OCR completion, call `functions/usage.ts` to increment `capturesThisPeriod`.
   - Structure `usage` documents as:
     ```json
     {
       "userId": "...",
       "periodStart": ISODate,
       "captures": 3,
       "tier": "free" | "premium"
     }
     ```
   - Reset monthly (or configurable via env `USAGE_PERIOD_DAYS`).
2. **Client enforcement**
   - Before running OCR, fetch `usage` to ensure quota isn’t exceeded.
   - If over limit, show upgrade modal instead of starting the worker.
3. **Mock billing**
   - Add `functions/payments.ts` that returns a fake checkout URL and always succeeds.
   - In the client, hitting “Upgrade” immediately marks the user as `tier = 'premium'` without calling a real processor when `USE_MOCK_PAYMENTS=true` (env).
   - Provide a developer override button to reset quotas during testing (`DEV_RESET_USAGE`, visible only in non-production).
4. **Future Stripe integration**
   - Document where to inject real Stripe logic (`createCheckoutSession`, webhooks) when ready.

---

## 5. Suggested Implementation Order

1. Delete OCR entries (local-only) → verify UX.
2. Scaffold auth + persistence (Netlify Identity or custom JWT) with MongoDB sync.
3. Add guest gating logic (leveraging new auth state).
4. Layer on usage tracking & mocked billing.
5. Replace mocks with real billing when ready.

Testing at each step should include: unit tests for store changes, contract tests for functions, and end-to-end smoke tests on mobile form factor.

---

## 6. Developer Notes

- **Local dev workflow:** use `netlify dev` so functions and identity run alongside Vite.
- **Data migrations:** write an `initRemoteFromIndexedDB()` helper to bootstrap cloud data for existing users during rollout.
- **Offline support:** keep IndexedDB writes even when offline, and replay them when back online (queue mutations).
- **Security:** ensure OCR blobs uploaded to the backend are virus-scanned / size-limited if we later store raw images.
- **Documentation:** update in-app help/tooltips to reflect guest limits and upgrade paths once the features ship.

Keep this guide alongside the main README so the broader project context remains intact.
