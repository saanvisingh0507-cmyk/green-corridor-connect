# Green Corridor Connect

Build a polished, single-page scrolling website called "Green Corridors" for a college project: "Green Corridor Identification" (urban ecology / remote sensing). The site explains and lets visitors interact with a pipeline that maps existing vegetation from Sentinel-2 imagery, builds a cost surface, and proposes ecological corridors between fragmented green patches using least-cost paths.

DESIGN
- Earthy, editorial look: warm off-white background (#f6f4ee), deep green primary (#1f7a45), light green (#8fd19e), orange accent (#e07b1f) reserved for corridors. Serif display font (Fraunces) for headings, Inter for body. Full light/dark mode with a toggle in the nav.
- Sticky top nav with section links, a scroll-progress bar under it, and smooth-scroll anchors. Fully responsive (mobile first).
- Scroll-triggered reveal animations (fade/slide up) on every section; subtle parallax on the hero. Respect prefers-reduced-motion.

SECTIONS (in order)
1. Hero: headline "Connecting the city's green islands", short subline, and an animated canvas/SVG background of green patches with orange corridors slowly drawing themselves between them. A "Scroll" cue and a CTA button that scrolls to the interactive map. Below it, 4 stat chips: 10 m Sentinel-2 resolution, NDVI + Otsu threshold, resistance scale 1 to 10, MST corridor selection.
2. The problem: 2-column layout explaining habitat fragmentation. Include an animated count-up of three illustrative fragmentation metrics (patch count, mean patch area, mean nearest-patch distance) that animate when scrolled into view. Label them clearly as sample values.
3. Pipeline: a sticky scroll-story with three steps that change as the user scrolls. Step 1 Vegetation mapping (download Sentinel-2, compute NDVI, Otsu threshold to green mask, vectorize patches, fragmentation metrics; hands off ndvi.tif, green_mask.tif, patches.geojson). Step 2 Cost surface (OSM roads and buildings, resistance vegetation 1 / open land 3 / roads 8 / buildings 10, patch importance score; hands off cost_surface.tif, patch_scores.csv). Step 3 Corridors (networkx patch graph, skimage route_through_array least-cost paths, minimum spanning tree or top-N by benefit, metrics; outputs corridors.geojson, metrics.json). Each step shows a small animated illustration on the sticky side (NDVI gradient turning into a mask, a cost grid heatmap, a path being traced).
4. Interactive corridor map (the centerpiece). Generate a synthetic city on a 160x100 grid in the browser using seeded value noise: water (a river), arterial roads with bridges, street-grid building blocks near the center, open land, and vegetation. Extract green patches by flood fill (minimum size 18 cells), compute a representative cell per patch, and find corridors with Dijkstra (8-connected, geometric step cost, cell cost = average of two cells' resistance: open 3, vegetation 1, road 8, building 10, water 40) between each patch and its 4 nearest neighbours, then choose corridors with a Kruskal minimum spanning tree ordered by path cost. Render on a canvas with smooth land-cover colors (vegetation greens varying by noise, tan open land, light roads, grey buildings, blue water), translucent green patch fill with dark green outlines, and orange corridors with white casing. Interactions: a slider for number of corridors (cheapest first), toggles for land cover / patch outlines / corridors, a "New city" button that reseeds, hover or click on a patch to show a tooltip card (patch id, area in hectares at 10 m cells, whether it is connected to the largest component), and a live metrics panel: connected components before to after, total corridor length in km, roads crossed. Include a legend and a note that data is synthetic and the real project swaps in real GeoJSON outputs.
5. Cost surface playground: a smaller interactive canvas of the same city where the visitor changes resistance sliders (road, building, open land, each 1 to 20) and the corridors recompute and reroute in real time; show the total path cost of the chosen corridor set. Add a short explanation of why a cost surface was used instead of supervised ML (no ground-truth corridor labels).
6. Results / metrics: a before vs after comparison with a draggable split-slider revealing the map without vs with corridors, plus animated metric cards (components before to after, total length, roads crossed).
7. Repo guide: a table of folders data/, vegetation/, cost/, corridors/, app/, site/ with owner (Person 1, Person 2, Person 3), what each contains, and the single file it hands off. Add a small "shared rules" callout: same CRS (UTM), 10 m resolution, same bounding box.
8. Footer with credits (Sentinel-2, OpenStreetMap, scikit-image, networkx, Streamlit) and back-to-top button.

TECH
- React + TypeScript + Tailwind + shadcn/ui, no backend needed. Keep all simulation logic in reusable hooks/utilities (grid generation, flood fill, Dijkstra with a binary heap using Float64 distances, Kruskal with union-find) so it is easy to later swap synthetic data for real GeoJSON. Use Float64Array for distance arrays to avoid rounding cycles. Make canvases responsive and crisp. Add accessible labels and keyboard support for sliders and toggles.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f44f7044-47e7-43c8-92ab-c387e457ecfc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
