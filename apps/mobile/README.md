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
- Live preview is opt-in: off until the user taps Live (the choice is remembered per device), then at most 6 sequential image samples in 30 seconds, 3 seconds between completed samples. No overlapping requests. Leaving the screen/backgrounding cancels work and discards late results; after the session's budget is reached it pauses until the user taps Resume.
- Live results identify the last sampled image; this is not frame-by-frame tracking or text replacement on the scene. Validated against Google Translate on real signage/menus/book pages on a physical iPhone before being promoted out of beta.
- Hebrew/English reader: OCR is cleaned (page headers/numbers, stray glyphs) and split into headings and sentences, each paired with its English. Tapping a word opens a bottom sheet that explains it in its sentence (meaning, prefix breakdown, lemma, root, binyan) via the `word-analysis` function, which needs `ANTHROPIC_API_KEY` on Netlify and otherwise falls back to a plain word translation. Speech, niqqud/English toggles, saving passages and vocabulary (with the source sentence), reading the existing cloud library.
- Pasted Hebrew text provides a non-camera fallback.

Not migrated yet: offline library/cache and mutation sync, spaced repetition review, full settings/profile controls, deletion UI, and the unmerged NLP pipeline. Native document types reuse the web contract as type-only imports.

## Preview build (testing away from the computer)

The `preview` build is a standalone app with the JavaScript inside it, so it runs without Metro or a QR code. It is distributed ad hoc: installed from a link and limited to registered devices. It receives over-the-air updates on the `preview` channel. The `development` build uses the bundle ID `com.michaperki.mila.dev` ("Mila Dev"), so both apps can be installed at the same time.

One-time setup:

1. Register the iPhone: `npx eas-cli@latest device:create`, choose the website option, and open the link on the iPhone to install the profile.
2. On the iPhone, turn on Settings → Privacy & Security → Developer Mode. iOS requires this for ad hoc apps.
3. Build: `npx eas-cli@latest build --platform ios --profile preview`, sign in with your Apple ID when asked, then open the install link on the iPhone.
4. Connect GitHub at expo.dev → project → Settings → GitHub, with base directory `apps/mobile`. After that, `.eas/workflows/preview.yml` runs on every push to `main`. If the native layer is unchanged (same fingerprint), it publishes an OTA update. Otherwise it starts a new preview build, which also has to be installed from its link.

Ship JS changes by hand: `npx eas-cli@latest update --channel preview --message "..."`. The app downloads updates when it launches and applies them the next time it starts. Account → Check for updates applies one immediately. Account → App version shows which update is running.

Field feedback: the flag button (camera) and Report (reader) save a note together with the OCR text, segments, word analysis and app version. Photos are not included. Read them with `npm run feedback` in `apps/web`.

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
