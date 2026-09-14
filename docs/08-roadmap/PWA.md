# Progressive Web App

## Part 1: Installability foundation

NestlyPDF can be installed as a standalone browser application on supported Android, iOS/iPadOS, and Chromium desktop browsers. This part provides the manifest, mark-only icons, standalone presentation detection, safe-area layout, and platform-appropriate install guidance.

## Included

- Web app manifest with standalone display, root start URL, root scope, theme/background color, and orientation support.
- Local PNG, maskable, Apple touch, and favicon assets generated from the NestlyPDF document/Q mark.
- HTML manifest, theme-color, Apple standalone, touch-icon, and favicon metadata.
- Presentation-only standalone detection via `display-mode: standalone` and iOS `navigator.standalone`.
- Safe-area-aware application shell using `100dvh` and top/bottom safe-area insets.
- An explicit iOS Safari installation action that opens a dismissible Add to Home Screen instruction sheet.
- A deferred Chromium install action through `beforeinstallprompt`, hidden after `appinstalled` or an accepted prompt, and surfaced through a non-intrusive landing onboarding card before installation; its install action appears only when installation is genuinely available.

## Explicitly not included

Part 1 does not register a service worker and does not implement offline support, application-shell caching, background sync, update notifications, autosave, IndexedDB, localStorage, document restoration, or any document cache.

NestlyPDF continues to keep active PDFs, overlays, signatures, images, clipboard content, history, and editor state only in browser memory for the active session. Installing the application does not alter this privacy model.

## Routing

The manifest starts at `/` with scope `/`. The existing SPA route behavior remains unchanged:

- `/` opens the landing page.
- `/privacy` remains refreshable through the static host fallback configuration.
- `/editor` without an active in-memory document redirects to the landing page.

## Future parts

Later PWA work must receive a separate privacy review before adding any service worker, cache, offline capability, or update behavior. User document bytes must never enter a service-worker cache.

## Part 2: Offline application shell

Production builds now precache only NestlyPDF-owned shell assets, including the lazily loaded `.docx` conversion chunks (`docx-preview`, `html2canvas`) so Word import also works offline. User document bytes and editor sessions remain excluded from Cache Storage and remain memory-only.

Each generated production shell receives an immutable `quickpdf-shell-<content-hash>` cache name derived from its final precache contents. Installation populates that new cache atomically, validates expected content types for shell assets, and discards the new cache if any required asset cannot be safely cached. Navigation remains network-first while online and falls back only to the canonical cached `/` shell when offline. That HTML response is normalized into a fresh, redirect-free `Response` before caching, so service-worker navigation never returns hosting redirect metadata to browsers that reject it. Static assets use exact same-origin, query-free precache path matching and never receive the SPA HTML fallback. Activation deletes only older `quickpdf-shell-*` caches after the new cache has installed successfully.

## Physical-device offline acceptance

Offline acceptance must use the built production application, never `npm run dev`. Development deliberately does not register the production service worker, so an app installed from a Vite development or plain LAN HTTP origin cannot establish the NestlyPDF shell cache required for an offline launch.

Use a production HTTPS deployment or an equivalent locally trusted HTTPS server that exposes the generated `dist/` directory to the device. A plain address such as `http://10.0.0.50:4173` is not a secure context on a separate phone or tablet and is not a valid service-worker/PWA offline test path. `npm run preview` is useful for local desktop checks; its default `127.0.0.1` binding is not reachable from a separate device.

Before installing, verify in the physical browser's remote debugging tools that `navigator.serviceWorker.controller` is non-null, the registration scope is the application's root scope, and the `quickpdf-shell-*` cache contains the shell assets. Then install the app, launch it once online, close it, disable Wi-Fi and mobile data, and launch it from the home screen. Confirm the landing page, local PDF rendering, `.docx` to PDF conversion, editing, Original Size export, and Compress PDF export work without network access. Clear the installed app and site data for the exact test origin before retesting a new build.

The static `Starting NestlyPDF...` boot surface in `index.html` is visible before the React bundle mounts. It is removed only after a successful React mount, so a cached HTML document with a missing or failing bootstrap asset shows a recovery message rather than a featureless black screen. It does not diagnose PDF compatibility and does not enable caching in development.
For a bounded physical-device diagnosis, open the existing landing-page mobile menu and choose `PWA Diagnostics` while online. It routes to `/pwa-diagnostics` inside the SPA, which keeps the surface reachable from an installed app with no address bar. The former `/?pwa-debug=1` entry remains temporarily supported for compatibility. After the normal compatibility startup completes, it displays only the launch URL, standalone state (including `navigator.standalone` and `display-mode` independently), online state, worker controller and registration metadata, shell-cache asset checks, canonical cached-navigation response metadata, and manifest launch configuration. It never displays document names, document contents, filenames, or editor-session data. Use `Show diagnostics text` to record the values before airplane mode and again after a failed offline launch. This temporary diagnostic route should be removed after physical acceptance is complete.

Automated production coverage includes a fresh-page, standalone-emulated navigation to the manifest `start_url` after the original controlled page closes and the browser context goes offline. This is the closest Playwright approximation of a home-screen launch. It cannot prove Android storage survives an OS/browser restart or distinguish an Android home-screen shortcut from a manifest-backed installed PWA; those remain physical-device checks.

## Build identity

Production and development bundles receive immutable build metadata from the `package.json` semantic version and build-time Git/environment metadata. The landing footer shows `v<version> · <sha>`, while `/pwa-diagnostics` reports the application version, SHA, branch, and mode. Generated service workers embed the same metadata and respond to the `QUICKPDF_BUILD_METADATA` message only with that build identity, allowing diagnostics to compare current, active, waiting, and installing builds without exposing document or user data. Git is optional: deployments without Git metadata build successfully with `unknown` SHA/branch values.
