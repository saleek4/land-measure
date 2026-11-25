# land-measure

Personal iPhone web app (PWA) to measure land plot areas with the phone only.

- **GPS corners / walk boundary**: averages GPS readings per corner, skips readings while the phone moves, estimates slope from GPS height.
- **Live map on the Measure tab**: a small satellite map shows where you stand (blue dot), the corners you have marked with GPS (green) and tells you whether you are inside the marked plot. The Map tab also opens on your own location.
- **Satellite map tab**: tap or drag points on Esri World Imagery to estimate an area without GPS. Distances, perimeter and area show at the top, and the area fill is transparent (adjustable) so the imagery stays visible. Where Esri has no sharp picture (grey "Map data not yet available" tiles), the app shows the best lower-zoom imagery instead; the sharpest level can also be set by hand in the map options.
- **Split a plot** (Map tab > Tools, or Split on a saved plot): ready-made ideas shown as pictures (2 equal parts, 3 strips, from a corner, keep a quarter, 3 m road). Live controls for side/corner, equal parts, ratio, cents, road strip. Parts are drawn in colour on the map and can be saved as separate plots.
- **Exclude areas** (house, pond): taken out of the area, net area shown.
- **Record area**: type the deed / Ente Bhoomi area and see the difference in % against the measuring error.
- **Tape lengths**: type sides (and diagonals) in metres or feet; the plot is drawn, area and error are worked out, then placed on the map (move / turn it onto the land).
- **Magnifier** while dragging a point, per-point **notes and photos** (photos stay in the phone's IndexedDB, not in the backup).
- Exports: plan PDF, plan picture, KML (with excluded areas and point notes), GeoJSON, summary text.
- Units: cent, acre, sq m, sq ft, Ha-Ar-m2. Saved plots, backup.

Map pictures: Tiles (c) Esri, Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community. Place search: OpenStreetMap Nominatim.
