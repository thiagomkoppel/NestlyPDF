# HTTP Security Headers

NestlyPDF is a static, client-only app. It has no backend, so the headers below protect users from
injected scripts, embedding in hostile pages and leaking the page address, not from server attacks.

## Where they are defined

`public/_headers` is copied into `dist/` by Vite and applied by Cloudflare static assets to every
response (including the SPA fallback page). `public/robots.txt` is served as a normal asset.

`/.well-known/security.txt` is deliberately **not** in the repository: it is managed in the
Cloudflare dashboard (Security Center), and a file here would conflict with it.

## Policy

| Header                                | Value (summary)                                       | Why                                                              |
| ------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| `Content-Security-Policy`             | everything `'self'`; no remote origins                | PDFs never leave the device, so no request may go anywhere else. |
| `Referrer-Policy`                     | `no-referrer`                                         | No page address is sent when following the GitHub link.          |
| `X-Content-Type-Options`              | `nosniff`                                             | Stops MIME sniffing.                                             |
| `X-Frame-Options` + `frame-ancestors` | `DENY` / `'none'`                                     | Prevents clickjacking and embedding.                             |
| `Permissions-Policy`                  | camera, microphone, geolocation, payment, usb… denied | The app uses none of them.                                       |
| `Cross-Origin-Opener-Policy`          | `same-origin`                                         | Isolates the window from cross-origin openers.                   |

CSP specifics that are easy to break:

- `script-src` allows the inline boot-fallback script in `index.html` by SHA-256 hash. **If that
  script changes, update the hash** (`tests/security-headers.test.ts` fails until you do).
- `'wasm-unsafe-eval'` is required by pdf.js WebAssembly decoders; `'unsafe-eval'` is not allowed.
- `worker-src 'self' blob:` and `img-src … blob: data:` are needed for the pdf.js worker, canvas
  exports and generated thumbnails.
- `style-src 'unsafe-inline'` is needed for React inline styles and `docx-preview` / html2canvas.
- `upgrade-insecure-requests` is part of the policy; local previews served over plain HTTP should
  ignore it.

## Verification

Run against a production build in Chromium: open a PDF, add Patrick Hand text, export at
Original Size and each compression level, import a `.docx`, open `/privacy`, with the service worker
active. No CSP violations were reported.

After each deploy, open the site, open the browser console and confirm there are no
"Refused to …" messages; check headers with `curl -I https://<site>/`.

## Set in Cloudflare, not here

- HSTS (SSL/TLS → Edge Certificates).
- Bot Fight Mode, MFA on the account, security.txt.

Caveat: Bot Fight Mode's JavaScript detection injects an inline script, which this static CSP
blocks. Bots are still challenged by other signals; if it ever causes visible breakage, review it.
