# VAVE.LOG as an app

The full tool can be installed from the quiet **Install app** link on the sign-in screen or in **Settings → VAVE.LOG app**. The browser either offers its installation prompt or the dialog explains the relevant browser steps. English, German and Simplified Chinese follow the app language. All existing roles, workflows and connections are shared with the website.

Projects, time, invoices and account operations require a connection. There is no offline write queue or offline database. A previously loaded app shows connection status; an offline navigation displays a branded retry page without workspace content. Query-bearing authentication links, OAuth, API, MCP, non-GET requests and external requests bypass the worker.

The root service worker stores only `/offline.html`, `/offline.css`, `/offline.js` and `/favicon.svg`. Installation validates MIME types, successful status and absence of redirects before caching. The application document, configuration, exports, Supabase responses and tokens are never added to CacheStorage. Existing Supabase authentication persistence is unchanged.

Updates wait for an explicit **Reload and update** action in Settings. Save open work first. Other tabs are not automatically reloaded. The worker version follows the build contents, including application-only changes; owned old caches are removed on activation. A registration failure leaves the ordinary online app usable.

`npm run build` creates deterministic PNG icons from the existing vector mark and versions the worker. Both hosts serve the manifest as `application/manifest+json`, disallow worker HTTP caching and allow only same-origin workers/manifests in CSP. The manifest link includes credentials for the private Site gateway. The hosting audience remains unchanged.

Automated coverage includes the worker allowlist and exclusions, installation/update lifecycle, headers, generated icon dimensions, and browser offline/reconnect/install flows on desktop and mobile viewports. The native OS installation sheet and real iOS home-screen behavior require a real device; headless browser tests do not verify those surfaces.
