# CLAUDE.md — land-measure

Read this first. It is the hand-over note for any new Claude Code session on this repo.

## What this is
A personal land-measuring app by Saleek (Malappuram, Kerala; iPhone 16 Pro; GitHub `saleek4`). It measures plots of 1 cent up to 10 acres using only the phone: GPS corners, walk boundary, satellite-map points, tape lengths with crosses, freehand draw, edit sides and points, fit-to-wanted-area, split, exclude areas, record-area comparison, exports (PDF, PNG, KML, GeoJSON), backup, and optional email sign-in with cloud sync.

- Live (GitHub Pages, branch `main`, folder `/`): https://saleek4.github.io/land-measure/
- Today it is a single-file PWA used from the iPhone Home Screen.
- Next: an Android app and a Play Store listing, built from the same web code (see Roadmap).

## How to talk to the user
- Reply in **Manglish** (Malayalam written in English letters) mixed with simple English, like the user writes. Short, direct, phone-friendly (the user reads on an iPhone).
- The user is not a programmer. Say what changed and what to tap to check it; do not paste code unless asked.
- Say plainly what could NOT be tested here (real GPS, touch on a real phone, real Esri / Firebase / iOS share sheet).

## Layout
```
index.html          BUILT output served by GitHub Pages. Never edit by hand.
sw.js               service worker (network-first, same-origin only). Bump CACHE on every release.
src/index.src.html  THE SOURCE OF TRUTH: all HTML, CSS and JS of the app.
src/icon.b64        app icon (base64 PNG); build replaces the __ICON__ placeholder with it.
build.js            node build.js -> writes index.html
tests/              node + Playwright tests, fixtures/ (mock map tiles, test photo), run_all.js
CLAUDE.md, README.md
```

## Build, test, release
```
node build.js              # src/index.src.html + src/icon.b64 -> index.html
node tests/run_all.js      # rebuilds, then runs every test and prints a summary (about 3 minutes)
node tests/run_all.js edit # only the test files whose name contains "edit"
npm run serve              # http://localhost:8080 (needs nothing but node)
```
Release routine: edit `src/index.src.html` -> `node build.js` -> run the tests -> bump `CACHE` in `sw.js` (currently `land-measure-v15`; keep the `v<number>` pattern) -> commit `src/`, `index.html`, `sw.js` together -> push to `main` (Pages publishes in about a minute). Update README when a feature is added.

Tests: Playwright + Chrome. `tests/helpers.js` finds Playwright (`npm install` or a global copy) and Chrome (`CHROME_PATH` env, common locations, else Playwright's own Chromium). Browser tests mock the map tiles, Nominatim and Firebase, so they need no internet. Screenshots go to `tests/shots/` (git-ignored). Python 3 with Pillow and poppler (`pdfinfo`, `pdftoppm`) are used by a few tests. In Playwright use `selectOption({ value: 'x' })`; a bare string matches label or value.

## Code map (src/index.src.html, one file, no libraries)
- `// <MATH> ... // </MATH>` block: pure functions (projection `toXY/fromXY`, `polyArea`, `pointInPoly`, `segInt`, GPS averaging, walk processing, tape solving, KML/PDF writers). The node tests `tests/test_*.js` extract this block and run it, so keep it free of DOM code.
- Custom slippy map on Esri World Imagery tiles. `MS` = persisted map state, `M` = runtime state. Corner = `{lat,lon,acc,src,note,ph,...}`.
- Field plan: `fpSheet`, `fpGet` (state in `draft.fp`: n, unit, hub, sides, crosses by key, check cross, `prev` = GPS points to go back to), `fpApply` (redraws the plot on the draft's spot), pure maths `fpAlign` (slide + turn, mirror if the draft runs the other way), `fpCheckPair`, `fpCheckTol` in the MATH block. It reuses `tapeCalc(T)` / `tapeVals(T)`, which take any state object shaped like `TP`.
- Undo / Redo: `rdoPush(A,before,kind,obj)` records a redo entry, `canRedo()` (valid only while the plot still equals the entry's `after`, else the stack is cleared), `mapUndo` / `mapRedo` (kinds 'pop','draw','fit','edit'), `editUndo` (re-pushes the edit-stack entry `M.estk`), `M.rdo` (map) and `M.mrdo` (Measure tab, `canMRedo()`); `gcPhotos` also scans these snapshots so photos survive undo.
- Edit toolkit: `editCardHTML`, `bindEdit`, `ptSetAngle`. Tape/crosses: `tapeVals`, `tapeCalc`, `tapeAutoHub`, `tapePlace` (cross values stored by key `'a-b'`).
- Backup: `backupJSON`, `backupNow` (iOS share sheet), `backupAsk`, `backupCard`.
- Cloud (dormant): the block before `// ---------- formatting ----------` (`FB`, `acctSign`, `syncMerge`, `syncNow`, `cloudOk`...). Plain Firebase REST, no SDK; one Firestore doc per plot `users/{uid}/plots/{id}` with `json`, `upd`, `del`. `FB = {apiKey, projectId}` is empty until the user provides them; then bump the SW cache and republish.
- Storage keys (do not rename; old data depends on them): `lm.map.v1`, `lm.draft.v1`, `lm.plots.v1`, `lm.settings.v1`, `lm.backup.v1`, `lm.backupask.v1`, `lm.acct.v1`, `lm.sync.v1`. Photos live in IndexedDB and are never synced or backed up.

## Hard rules (learned the hard way)
1. **Never rename the repo or change the Pages URL / origin.** On iPhone the Home Screen icon's saved plots belong to that origin, and deleting the icon deletes the plots (this already cost the user real plots). Keep the backup warnings.
2. Do not break stored data: any change to a stored shape must read old data.
3. Accuracy claims must stay honest (phone GPS is roughly 2-5 m; the app reports an error estimate). Do not promise survey-grade results.
4. Keep it offline-friendly: the service worker must never cache cross-origin requests.
5. Mobile first (390 x 844 viewport, touch, thumb reach). Check new UI at that size.

## Roadmap
1. **Web app (now):** finish and polish. Waiting on the user's Firebase `apiKey` and `projectId` to switch cloud sync on. Ideas offered but not built: "Sign in with Google" (risky inside an iOS Home Screen app: popup/redirect problems), measure-again/average runs.
2. **Android app (next):** wrap the same web code. Preferred route: **Capacitor** (`webDir` = a copy of `index.html` + assets built into `www/`), because it gives native GPS permission handling, file saving and sharing, and a normal Android Studio project. Alternative: a Trusted Web Activity (Bubblewrap / PWABuilder) which is lighter but gives less native control. Android points to check: runtime location permission, share/save of backup files (Android has no iOS-style share-only limit, so a real file save is possible), back-button handling, status bar / safe areas, adaptive icon, `localStorage` survives app updates but is lost on uninstall (keep the cloud sync and backup).
3. **Play Store listing:** Play Console developer account (one-time fee); package id (proposal `com.saleek.alavu`); store title with keywords (for example "Alavu: Land Area Measure"); short and full description (English + Malayalam); icon 512 x 512, feature graphic 1024 x 500, phone screenshots; privacy policy URL (needed because of location and optional email sign-in); Data safety form; content rating; target API level current at release; signed AAB. New personal developer accounts may have to run a closed test with a minimum number of testers for a set period before production: check the current Play Console rules when starting.
4. **Before any public release, resolve these (they are fine for private use only):**
   - Map tiles: the app calls Esri World Imagery tiles directly. Check Esri's terms for use in a published app and switch to a licensed provider or API key if required.
   - Place search uses the public OpenStreetMap Nominatim server, whose usage policy forbids heavy or app-wide use. Use a proper geocoding provider for a public app.
   - Add a privacy policy, a short in-app disclaimer (not a legal survey), and decide on photo backup.

## App name
Working title proposed to the user: **Alavu** (അളവ് = measurement). Not final until the user confirms. When the name is confirmed: update `<title>`, manifest name, header and About text in `src/index.src.html`, the README, and the Android `appName`. The repo and URL stay `land-measure`.
