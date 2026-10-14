# VAVE.LOG as an installable app

## Intent and scope
The whole existing tool should launch from a home screen, taskbar or dock in its own window, with the same workspace, roles, languages, links and Supabase persistence. The user delegated design, implementation, merge and publication. This is an installation subsystem around the existing application, not a new offline database or a native-store wrapper.

## Design
- Stable manifest id and start URL `/`, scope `/`, `display: standalone`, brand theme/background, 192/512 PNG icons plus a maskable 512 PNG and Apple 180 icon. Icons derive from the existing vector favicon. No dependency or new visual identity.
- Installation lives in Settings and a quiet link on sign-in. A shared provider captures the optional browser install event and app-installed/display-mode state. A dialog offers the native prompt when available, otherwise accurate browser/iOS instructions. No automatic promotional popup. EN/DE/ZH, current language preference, English fallback.
- The service worker precaches only a public branded offline document, its local CSS/JS and favicon. It never stores application HTML, account data, API/config/Auth/MCP responses, requests with credentials/tokens, exports or financial data. Ordinary navigation is network first; failed network navigation can show the offline document. Auth/OAuth and API paths are excluded. Errors from a reachable server are preserved, not hidden behind offline success.
- Existing open pages get an offline status hint. Saving remains online and rejected requests retain normal failure handling. There is no write queue/background sync, and the UI never promises an offline save.
- Install precache must reject failed, redirected, cross-origin or wrong-content-type responses. Activation cleans only older caches owned by this PWA. The first worker claims clients; later workers wait. Update activation/reload requires an explicit click in Settings and a clear save-work hint. Other tabs are not force-reloaded. Registration failures leave the normal tool usable.
- Standalone safe-area spacing protects notch/home-indicator controls. Preserve audience: current Site remains owner-private. Auth flows and existing query/hash navigation remain unchanged. Metadata/worker MIME, no-store update headers and CSP are correct in both Node and Worker hosting.

## Validation
Unit tests execute service-worker install/fetch/activate/message handlers with controlled Cache Storage/network doubles, proving no sensitive caching and failure behavior. HTTP/build tests verify manifest/icon metadata and headers. Browser CI exercises actual registration, offline navigation/reconnect, cache allowlist, install-event handling/manual instructions, dismissal/installed state, localization and updates without losing page state. Existing desktop/mobile workflows remain required. Native OS installation sheets and iOS device behavior need real-device confirmation and are not claimed by headless tests.
