# Land Alavu (repo: land-measure)

Land Alavu (അളവ് = measurement) is a personal iPhone web app (PWA) to measure land plot areas with the phone only.

- **GPS corners / walk boundary**: averages GPS readings per corner, skips readings while the phone moves, estimates slope from GPS height.
- **Fit to a wanted area** (Tools): type the area you want (say 94 cent). The app adds a new point on the last, unclosed side (pushed out or in), or moves one corner along a boundary line, so the plot comes to exactly that area. Undo puts it back.
- **Edit sides and points** (Map tab > ✥ Edit, or Tools): tap a side to lengthen or shorten it and turn its direction with − / + buttons or typed values (the point at the chosen end moves, the rest stay joined). Tap a point to move it with N/W/E/S arrow buttons, set its distance to the neighbouring points, or set the corner angle (this point moves along an arc, or turn a neighbouring side). Add a point in the middle of a side, delete a point, undo each edit, show all corner angles on the map. Move plot has arrow buttons too.
- **Field plan** (Measure tab or Map > Tools): the GPS / map points are only a rough draft. The plan lists the steps to get the exact shape with a tape in the fewest readings: mark and number the corners, measure the sides, then only corners − 3 crosses from the best hub corner (tap a corner on the picture to change it), plus one optional check cross that catches a tape slip. Every box shows "about X m" from the draft and is flagged when far from it. The result compares the tape area with the draft, and "Put on the map, same place" redraws the plot from the tape lengths over the draft (turn direction matched, so a clockwise draft stays clockwise); "Back to the GPS points" undoes it. Typed lengths are kept with the draft, and the list can be shared as text for the field.
- **Weak GPS**: before a capture with a fix worse than ±8 m the app asks to wait, place the corner on the satellite map, or capture anyway. A "GPS weak here? Place corner N on the satellite map" button sits under Capture. Map points and GPS points can be mixed in one plot.
- **Undo and Redo**: wherever there is an Undo there is now a Redo too: the Map toolbar (↶ and ↷ Redo, add / remove / draw / fit), the Edit card (↶ Undo and ↷ Redo for side and point edits), the hole (exclude area) card, and Measure tab "Undo last" / "Redo". A new action after an Undo clears Redo, as usual. Photos on a point are kept while it can still be undone or redone.
- **Clearer picture** (Map > options): more contrast on the satellite picture so field edges, trees and roofs stand out. It cannot add detail the satellite photo does not have.
- **Account and cloud backup** (More tab, once the Firebase keys are set in `index.html`: `FB={apiKey,projectId}`): sign in with email and password; saved plots sync to the user's own Firestore (`users/{uid}/plots/{id}`, one document per plot with the plot as JSON, a change stamp and a deleted flag). The newest copy of each plot wins, deletions travel as small "deleted" notes, sync runs by itself after every save, on opening the app and when the phone comes back online. Photos stay on the phone. Plain REST calls, no Firebase library. Firebase setup: create a project, enable Authentication > Email/Password, create a Firestore database, and publish these rules:

  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{db}/documents {
      match /users/{uid}/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
  ```
- **Backup reminder**: saved plots live only inside the app (deleting the Home Screen icon or clearing Safari data erases them). After a save, and on the Plots tab, the app asks for a backup when there is none from the last day / week or when plots were added since. "Back up now" opens the share sheet with a dated .json file (Files, iCloud Drive, WhatsApp). More tab > Import restores it. A Safari tab and the Home Screen icon keep separate plots, and the app says so.
- **Freehand draw**: on the Map tab tap Draw and sketch the outline of the plot with one finger. It becomes a rough polygon with its area straight away (two fingers move or zoom the map; Undo removes the whole drawing).
- **Units**: area in cent, acre, sq m or sq ft; lengths in metres or feet (More tab, or Map options). Tap the big area number on a result to cycle the area unit.
- **Live map on the Measure tab**: a small satellite map shows where you stand (blue dot), the corners you have marked with GPS (green) and tells you whether you are inside the marked plot. The Map tab also opens on your own location.
- **Satellite map tab**: tap or drag points on Esri World Imagery to estimate an area without GPS. Distances, perimeter and area show at the top, and the area fill is transparent (adjustable) so the imagery stays visible. Where Esri has no sharp picture (grey "Map data not yet available" tiles), the app shows the best lower-zoom imagery instead; the sharpest level can also be set by hand in the map options.
- **Split a plot** (Map tab > Tools, or Split on a saved plot): ready-made ideas shown as pictures (2 equal parts, 3 strips, from a corner, keep a quarter, 3 m road). Live controls for side/corner, equal parts, ratio, cents, road strip. Parts are drawn in colour on the map and can be saved as separate plots.
- **Exclude areas** (house, pond): taken out of the area, net area shown.
- **Record area**: type the deed / Ente Bhoomi area and see the difference in % against the measuring error.
- **Tape lengths**: type sides and crosses (tapes straight across the plot) in metres or feet; the plot is drawn, area and error are worked out, then placed on the map (move / turn it onto the land). The sheet says how many crosses are needed (corners − 3) and shows them on a picture. Tap a corner (or use the list) to take the crosses from that corner; "Suggest the best corner" picks, from the rough shape already on the map, the corner whose crosses stay inside the plot and avoid thin triangles.
- **Magnifier** while dragging a point, per-point **notes and photos** (photos stay in the phone's IndexedDB, not in the backup).
- Exports: plan PDF, plan picture, KML (with excluded areas and point notes), GeoJSON, summary text.
- Units: cent, acre, sq m, sq ft, Ha-Ar-m2. Saved plots, backup.

Map pictures: Tiles (c) Esri, Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community. Place search: OpenStreetMap Nominatim.

## Development
Edit `src/index.src.html` (never `index.html`), then `node build.js`, then `node tests/run_all.js`. Details, code map, release routine and the Android / Play Store roadmap are in [CLAUDE.md](CLAUDE.md).
