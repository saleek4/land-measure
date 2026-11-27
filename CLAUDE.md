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
Release routine: edit `src/index.src.html` -> `node build.js` -> run the tests -> bump `CACHE` in `sw.js` (currently `land-measure-v20`; keep the `v<number>` pattern) -> commit `src/`, `index.html`, `sw.js` together -> push to `main` (Pages publishes in about a minute). Update README when a feature is added.

Tests: Playwright + Chrome. `tests/helpers.js` finds Playwright (`npm install` or a global copy) and Chrome (`CHROME_PATH` env, common locations, else Playwright's own Chromium). Browser tests mock the map tiles, Nominatim and Firebase, so they need no internet. Screenshots go to `tests/shots/` (git-ignored). Python 3 with Pillow and poppler (`pdfinfo`, `pdftoppm`) are used by a few tests. In Playwright use `selectOption({ value: 'x' })`; a bare string matches label or value.

## Code map (src/index.src.html, one file, no libraries)
- `// <MATH> ... // </MATH>` block: pure functions (projection `toXY/fromXY`, `polyArea`, `pointInPoly`, `segInt`, GPS averaging, walk processing, tape solving, KML/PDF writers). The node tests `tests/test_*.js` extract this block and run it, so keep it free of DOM code.
- Custom slippy map on Esri World Imagery tiles. `MS` = persisted map state, `M` = runtime state. Corner = `{lat,lon,acc,src,note,ph,...}`.
- Field plan: `fpSheet`, `fpGet` (state in `draft.fp`: n, unit, hub, sides, crosses by key, check cross, `prev` = GPS points to go back to), `fpApply` (redraws the plot on the draft's spot), pure maths `fpAlign` (slide + turn, mirror if the draft runs the other way), `fpCheckPair`, `fpCheckTol` in the MATH block. It reuses `tapeCalc(T)` / `tapeVals(T)`, which take any state object shaped like `TP`.
- Undo / Redo: `rdoPush(A,before,kind,obj)` records a redo entry, `canRedo()` (valid only while the plot still equals the entry's `after`, else the stack is cleared), `mapUndo` / `mapRedo` (kinds 'pop','draw','fit','edit'), `editUndo` (re-pushes the edit-stack entry `M.estk`), `M.rdo` (map) and `M.mrdo` (Measure tab, `canMRedo()`); `gcPhotos` also scans these snapshots so photos survive undo.
- Tape / sketch crosses: `TP.cr` is `null` (fan from the hub corner, the old way) or a list of `[a,b]` corner pairs (any triangulation, a sketch). Pure maths in the MATH block: `tapeTriCheck(n,crs)` (count n-3, no side, no duplicate, no crossing, ear order), `tapeSolveTri(sides,crs,lens)` (places the last triangle, then adds corners back in reverse ear order; corners counter-clockwise). `tapeCalc` / `tapeVals` use `T.cr` when present. A stored plot keeps `tape.cr` only for the sketch way (old plots have none and read as a fan from `tape.hub`). Sheet: 3 to 12 corners, numbered picture (`#tDiaS` plain, `#tDia` tappable), `#tCm` toggle, `#tFanFill`, `#tClr`.
- Edit toolkit: `editCardHTML`, `bindEdit`, `ptSetAngle`. Tape/crosses: `tapeVals`, `tapeCalc`, `tapeAutoHub`, `tapePlace` (cross values stored by key `'a-b'`).
- Home tab (`renderMeasure`; the tab key is still `measure`, the nav label is "Home"). Fresh draft: name + place row, `.next` banner ("How do you want to measure?"), `#bSketch` tile, GPS card (`.gh` title, Corner points / Walk boundary toggle, big `#bCap` / `#bWalk`, chips), `#bToMap` tile, "Your saved plots" (last 3, `.hpl`, `#hplAll`), small live map, `#bTape` link (old tape list). With points: name row, banner, small map, summary card (area + **Save plot** `#bSave`, only with 3+ points), GPS card (Undo / Redo / Start over), tiles `#bSketch` `#bToMap` `#bField`, `#bTape` link, Result card (details, `#bRec`, `#fNotes`). Tests rely on these ids. Tools sheet (`toolsSheet`) is grouped: Fix the shape / Divide the land / Check and compare; `#tSketch` opens the sketch, `#tTape` is the tape list.
- **Sketch editor** (`skOpen` ... `skPlace`, one block before the field-plan code): full-screen overlay `#skv` with an SVG canvas of 360 x 520 (`SKW`, `SKH`), pointer events on `#skSvg`. State `SK` = `{open,wired,mode('draw'|'len'|'move'|'cross'|'res'),pts[{id,x,y}],closed,cr[[idA,idB]],L{'idA-idB':str},nid,u,sel,pend,un,re,dn,res}`. Corners have stable ids; lengths and crosses are keyed by corner ids, so undo, insert and delete keep them. Undo snapshots hold pts / closed / cr only (`skSnap`, `skPut`). It is persisted as `S.draft.sk` = `{pts:[[x,y,id]],closed,cr,L,nid,u}` (`skStore`, `skLoad`; `skLoad` also builds a round sketch from an old `d.tape`), and copied to `tape.sk` when placed. `skSolve` builds a `T` object and calls `tapeCalc`, then `skShape(P, S)` (MATH block) turns / mirrors the solved shape to look like the drawing (y flipped, so the top of the sketch is North). `skPlace` calls `placeTapeShape(make)`, the shared "put a tape shape on the map" step (also used by `tapePlace`). "Start over" and "Remove all points" clear `d.sk`. The length box sits in the top panel so the iOS keyboard does not cover it; the decimal keypad has no Enter, so there are Next / Back buttons. The canvas SVG viewBox always equals its size in pixels (`skSize`, `SKW` / `SKH` change with the panel above it; the view is anchored to the top left so the picture does not jump). Zoom / move is a view transform, not a change of the points: `SK.v` (drawing) and `SK.vr` (result) = `{z, cx, cy}` (cx, cy = the world point at the middle of the canvas), `skS(x,y,v)` world to screen, `skPt(e)` pointer to world, drawing code works in screen units so corners, pills and lines keep their size. Gestures in `skWire`: one finger on a corner drags it (Draw / Move), one finger on empty space pans, two fingers pinch (`skGestStart` / `skGestMove`), wheel zooms, `#skZi #skZo #skZf` buttons; `skFitSketch` / `skFitView` fit the drawing (done on open and when the shape is closed). Corner circles carry `class="skc" data-c="i"` for tests. Ids: `#skX #skUn #skRe #skMore #skStrip #skPanel #skSvg #skModes[data-sm]`, panel `#skCl #skIn #skU #skNext #skPrev #skStart #skRm #skDel #skSug #skClr #skPlace #skFix`, More sheet `#mTurn #mFit #mSug #mClr #mNew #mOk`. The app code is inside an IIFE, so tests read `localStorage` (`lm.draft.v1` -> `sk`), not `SK`.
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
Confirmed by the user (2026-11-26): **Land Alavu** (അളവ് = measurement). Done in the web app: `<title>`, Home Screen title (`apple-mobile-web-app-title`), header, PNG export footer, backup share title and file name (`land-alavu-backup-<date>.json`). The backup JSON marker `app:'land-measure'` stays as is (old backups must still restore). There is no manifest or in-app About text yet. For Android: `appName` = Land Alavu, package id proposal `com.saleek.alavu`, store title for example "Land Alavu: Area Measure". The repo name and URL stay `land-measure` (never rename). The name has had only a quick web search, not a trademark or Play Console check: do that before the Play Store release.
