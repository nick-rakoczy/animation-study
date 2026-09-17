# Project instructions

## UI validation

- Do not use the collaborative browser preview or a standalone Vite browser session to validate this application.
- This is an Electron application. Its renderer requires the `window.animationStudy` API from `renderer/src/global.d.ts` and `src/main/preload.cts`. A normal browser does not provide that preload API, so the application crashes during startup and displays a blank page.
- Validate renderer changes with `npm run typecheck`, `npm run build`, and the relevant automated tests.
- If a task requires visual verification, use the actual Electron application in an environment that supports its GUI. Do not treat a browser preview as evidence that the Electron UI works.
