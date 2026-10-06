# Mila native app

Expo SDK 57 / React Native app for iPhone-first development from Windows + WSL. The existing website stays in `apps/web`; both apps use the same Netlify API and MongoDB accounts.

## Run on your iPhone

Use Node 22 LTS and install dependencies from WSL (do not reuse Windows `node_modules`):

```sh
cd apps/mobile
nvm install
nvm use
npm ci
npm run start:tunnel
```

Open the QR code in the latest Expo Go on your iPhone. If Expo Go does not yet support SDK 57, use the development build below. `npm start` uses your LAN instead of a tunnel; Windows/WSL networking may require firewall or port-forwarding configuration.

The checked-in default API origin is `https://mila-hebrew.netlify.app`. To use a preview backend, copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to its HTTPS origin. Nothing secret belongs in this file. Native tokens are saved in the iOS Keychain/Android Keystore through Expo SecureStore. Web previews keep sessions in memory and are for layout checks; use the native app for the end-to-end flow.

## First migration slice

- Native navigation, login/signup, secure session restore, and account/logout.
- Camera permissions, photo capture, image import, and Google Cloud Vision Hebrew OCR through an authenticated server function.
- Explicit experimental Live preview: at most 6 sequential image samples in 30 seconds, 3 seconds between completed samples. No overlapping requests. Leaving the screen/backgrounding cancels work and discards late results.
- Live results identify the last sampled image; this is not frame-by-frame tracking or text replacement on the scene. A physical iPhone test must establish latency, shutter behavior, recognition quality, thermal impact, and usefulness before treating it as a production feature.
- Hebrew/English reader, tap-to-translate word lookup, speech, saving passages and vocabulary, reading the existing cloud library.
- Pasted Hebrew text provides a non-camera fallback.

Not migrated yet: offline library/cache and mutation sync, spaced repetition review, full settings/profile controls, deletion UI, and the unmerged NLP pipeline. Word lookups are isolated machine translations rather than morphology-aware contextual senses. Native document types reuse the web contract as type-only imports.

## Backend setup

Deploy `apps/web/netlify/functions/mobile-ocr.ts` with the existing Netlify functions. The app cannot use OCR until this endpoint is deployed.

Set **server-side** `GOOGLE_VISION_API_KEY` in `apps/web/.env` for local function testing and in Netlify's Functions environment for production. Enable Cloud Vision in the Google Cloud project and allow that API in the key's API restrictions. Translation continues using the existing `GOOGLE_API_KEY`. Existing `MONGODB_URI`, `MONGODB_DB_NAME`, and `JWT_SECRET` are also required. Redeploy after changing Netlify environment variables.

The OCR function requires a Mila bearer token, limits the base64 image to 2,000,000 characters, and stores only request counters (not camera images). Default limits are 15 attempts/minute and 200/day per account; change `MOBILE_OCR_MINUTE_LIMIT` and `MOBILE_OCR_DAILY_LIMIT` to adjust. Counters have a two-day TTL index. Failed provider attempts count toward these limits. These prototype limits are separate from the web app's capture quota. Set Google Cloud usage quotas/budget alerts for your overall project as well.

## Development builds from WSL

Check that the Apple Developer membership is active, enable Developer Mode on the iPhone, then:

```sh
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest device:create
npm run build:ios
npm run start:dev-client -- --tunnel
```

EAS builds iOS in the cloud. `eas init` links the app to your Expo account and records the project ID; no account-specific ID is fabricated in this scaffold. Review `com.michaperki.mila` before the first signed build. A development build needs rebuilding after changing native dependencies/configuration; ordinary JS changes use the development server. The preview profile produces an installable build that does not need the development server.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npx expo-doctor
npx expo export --platform ios
```

Backend regression tests live in `apps/web/tests/mobile-ocr.test.ts` and run with the existing web Vitest setup.

Physical iPhone acceptance: grant/deny camera access, import a HEIC image, capture portrait/landscape Hebrew, start/stop live mode, switch tabs/background during a slow request, sign out/in, save and reopen a passage, and verify saved words on the website. Repeat with weak connectivity and compare the same scenes with Google Translate. Cloud API success and JS bundle checks do not establish native camera quality.
