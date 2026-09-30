// Reusable GeoJSON -> cost grid -> least-cost corridor utilities.
// Works with any EPSG:4326 FeatureCollections; swap data without touching UI code.
import type { Feature, FeatureCollection, Position } from 'geojson';

export type Bounds = { west: number; south: number; east: number; north: number };
export type GeoWeights = { open: number; road: number; building: number; water: number; vegetation: number };
export const DEFAULT_GEO_WEIGHTS: GeoWeights = { open: 3, road: 8, building: 10, water: 40, vegetation: 1 };
export type GeoLayers = { green: FeatureCollection; water: FeatureCollection; roads: FeatureCollection; buildings: FeatureCollection };
export type GeoPatch = { id: number; featureIndex: number; name: string; type: string; areaHa: number; centroid: [number, number]; cells: number[]; center: number };
export type CostGrid = { cols: number; rows: number; cellM: number; bounds: Bounds; mLng: number; mLat: number; land: Uint8Array; roadId: Int32Array; patchAt: Int16Array; patches: GeoPatch[]; initialUnion: [number, number][] };
export type GeoCorridor = { a: number; b: number; cells: number[]; latlngs: [number, number][]; lengthM: number; cost: number; roadIds: number[] };

// land codes: 0 open, 1 vegetation, 2 road, 3 building, 4 water
export function cellCost(land: number, w: GeoWeights) { return land === 1 ? w.vegetation : land === 2 ? w.road : land === 3 ? w.building : land === 4 ? w.water : w.open; }

function rings(f: Feature): Position[][][] {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}
function lines(f: Feature): Position[][] {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  return [];
}
function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0, yi = ring[i]?.[1] ?? 0, xj = ring[j]?.[0] ?? 0, yj = ring[j]?.[1] ?? 0;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
export function metersPerDegree(lat: number) { return { mLat: 110574, mLng: 111320 * Math.cos(lat * Math.PI / 180) }; }
export function polygonAreaHa(f: Feature) {
  let c = 0, n = 0;
  for (const poly of rings(f)) for (const p of poly[0] ?? []) { c += p[1] ?? 0; n++; }
  const { mLat, mLng } = metersPerDegree(n ? c / n : 0);
  let area = 0;
  for (const poly of rings(f)) poly.forEach((ring, k) => {
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ((ring[j]?.[0] ?? 0) * mLng) * ((ring[i]?.[1] ?? 0) * mLat) - ((ring[i]?.[0] ?? 0) * mLng) * ((ring[j]?.[1] ?? 0) * mLat);
    area += (k === 0 ? 1 : -1) * Math.abs(s / 2);
  });
  return area / 10000;
}
export function featureCentroid(f: Feature): [number, number] {
  let x = 0, y = 0, n = 0;
  for (const poly of rings(f)) for (const p of (poly[0] ?? []).slice(0, -1)) { x += p[0] ?? 0; y += p[1] ?? 0; n++; }
  return n ? [y / n, x / n] : [0, 0];
}
export function patchType(p: Record<string, unknown> | null) {
  return String(p?.leisure ?? p?.landuse ?? p?.natural ?? 'green space');
}

export function rasterize(layers: GeoLayers, bounds: Bounds, cellM = 15): CostGrid {
  const { mLat, mLng } = metersPerDegree((bounds.north + bounds.south) / 2);
  const cols = Math.ceil((bounds.east - bounds.west) * mLng / cellM), rows = Math.ceil((bounds.north - bounds.south) * mLat / cellM);
  const land = new Uint8Array(cols * rows), roadId = new Int32Array(cols * rows).fill(-1), patchAt = new Int16Array(cols * rows).fill(-1);
  const toXY = (p: Position): [number, number] => [((p[0] ?? 0) - bounds.west) * mLng, (bounds.north - (p[1] ?? 0)) * mLat];
  const fillPolys = (fc: FeatureCollection, code: number, onCell?: (i: number, fi: number) => void) => fc.features.forEach((f, fi) => {
    for (const poly of rings(f)) {
      const proj = poly.map(r => r.map(toXY));
      const outer = proj[0] ?? [];
      if (!outer.length) continue;
      const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
      const c0 = Math.max(0, Math.floor(Math.min(...xs) / cellM)), c1 = Math.min(cols - 1, Math.floor(Math.max(...xs) / cellM));
      const r0 = Math.max(0, Math.floor(Math.min(...ys) / cellM)), r1 = Math.min(rows - 1, Math.floor(Math.max(...ys) / cellM));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const x = (c + .5) * cellM, y = (r + .5) * cellM;
        if (!inRing(x, y, outer) || proj.slice(1).some(h => inRing(x, y, h))) continue;
        const i = r * cols + c; land[i] = code; onCell?.(i, fi);
      }
    }
  });
  const fillLines = (fc: FeatureCollection, code: number, byId: boolean) => fc.features.forEach((f, fi) => {
    const hw = String((f.properties as Record<string, unknown> | null)?.highway ?? '');
    const half = Math.max(cellM * .75, ['motorway', 'trunk', 'primary'].includes(hw) ? 9 : 5);
    for (const line of lines(f)) {
      const pts = line.map(toXY);
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1] ?? [0, 0], [bx, by] = pts[k] ?? [0, 0];
        const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - half) / cellM)), c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + half) / cellM));
        const r0 = Math.max(0, Math.floor((Math.min(ay, by) - half) / cellM)), r1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) + half) / cellM));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          if (segDist((c + .5) * cellM, (r + .5) * cellM, ax, ay, bx, by) > half) continue;
          const i = r * cols + c; land[i] = code; if (byId) roadId[i] = fi;
        }
      }
    }
  });
  // Patches: each polygon feature in the green layer is one patch.
  const patchIndex = new Map<number, number>();
  layers.green.features.forEach((f, fi) => { if (rings(f).length) patchIndex.set(fi, patchIndex.size); });
  fillPolys(layers.green, 1, (i, fi) => { patchAt[i] = patchIndex.get(fi) ?? -1; });
  fillPolys(layers.water, 4); fillLines(layers.water, 4, false);
  fillPolys(layers.buildings, 3);
  fillLines(layers.roads, 2, true);
  for (let i = 0; i < land.length; i++) if (land[i] !== 1) patchAt[i] = -1;

  const patches: GeoPatch[] = [];
  const cellsBy: number[][] = [...patchIndex.keys()].map(() => []);
  for (let i = 0; i < patchAt.length; i++) { const p = patchAt[i] ?? -1; if (p >= 0) cellsBy[p]?.push(i); }
  for (const [fi, id] of patchIndex) {
    const f = layers.green.features[fi]; if (!f) continue;
    const centroid = featureCentroid(f);
    const [cx, cy] = toXY([centroid[1], centroid[0]]);
    const cc = Math.min(cols - 1, Math.max(0, Math.floor(cx / cellM))), cr = Math.min(rows - 1, Math.max(0, Math.floor(cy / cellM)));
    let cells = cellsBy[id] ?? [], center = cr * cols + cc, best = Infinity;
    for (const i of cells) { const d = (i % cols - cc) ** 2 + (Math.floor(i / cols) - cr) ** 2; if (d < best) { best = d; center = i; } }
    if (!cells.length) cells = [center];
    const props = f.properties as Record<string, unknown> | null;
    patches.push({ id, featureIndex: fi, name: String(props?.name ?? `Patch ${id + 1}`), type: patchType(props), areaHa: polygonAreaHa(f), centroid, cells, center });
  }
  // Patches that touch are one component from the start.
  const initialUnion: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < patchAt.length; i++) {
    const a = patchAt[i] ?? -1; if (a < 0) continue;
    for (const j of [i % cols < cols - 1 ? i + 1 : -1, i + cols < patchAt.length ? i + cols : -1]) {
      const b = j >= 0 ? patchAt[j] ?? -1 : -1;
      if (b >= 0 && b !== a) { const k = `${Math.min(a, b)}-${Math.max(a, b)}`; if (!seen.has(k)) { seen.add(k); initialUnion.push([a, b]); } }
    }
  }
  return { cols, rows, cellM, bounds, mLng, mLat, land, roadId, patchAt, patches, initialUnion };
}

export class MinHeap {
  private data: [number, number][] = [];
  get size() { return this.data.length; }
  push(item: [number, number]) {
    const a = this.data; a.push(item); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; const parent = a[p]; if (!parent || parent[0] <= item[0]) break; a[i] = parent; i = p; }
    a[i] = item;
  }
  pop(): [number, number] | undefined {
    const a = this.data, first = a[0]; if (!first) return undefined;
    const last = a.pop(); if (!last || !a.length) return first;
    let i = 0;
    while (i * 2 + 1 < a.length) {
      let c = i * 2 + 1; const l = a[c], r = a[c + 1];
      if (r && l && r[0] < l[0]) c++;
      const child = a[c]; if (!child || child[0] >= last[0]) break;
      a[i] = child; i = c;
    }
    a[i] = last; return first;
  }
}

/** 8-connected Dijkstra; stops early once all targets are settled. */
export function dijkstra(grid: CostGrid, w: GeoWeights, source: number, targets?: number[]) {
  const n = grid.land.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const want = new Set(targets ?? []); const heap = new MinHeap();
  dist[source] = 0; heap.push([0, source]);
  const costs = new Float64Array(n); for (let i = 0; i < n; i++) costs[i] = cellCost(grid.land[i] ?? 0, w);
  while (heap.size) {
    const cur = heap.pop(); if (!cur) break;
    const [d, p] = cur; if (done[p]) continue; done[p] = 1;
    if (want.delete(p) && targets && !want.size) break;
    const x = p % grid.cols, y = Math.floor(p / grid.cols);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
      const q = ny * grid.cols + nx; if (done[q]) continue;
      const nd = d + (dx && dy ? Math.SQRT2 : 1) * ((costs[p] ?? 0) + (costs[q] ?? 0)) / 2;
      if (nd < (dist[q] ?? Infinity)) { dist[q] = nd; prev[q] = p; heap.push([nd, q]); }
    }
  }
  return { dist, prev };
}
export function cellLatLng(grid: CostGrid, i: number): [number, number] {
  return [grid.bounds.north - (Math.floor(i / grid.cols) + .5) * grid.cellM / grid.mLat, grid.bounds.west + (i % grid.cols + .5) * grid.cellM / grid.mLng];
}
function tracePath(grid: CostGrid, a: number, b: number, dist: Float64Array, prev: Int32Array): GeoCorridor | null {
  const from = grid.patches[a]?.center ?? -1, to = grid.patches[b]?.center ?? -1;
  if (to < 0 || !Number.isFinite(dist[to] ?? Infinity)) return null;
  const cells: number[] = []; let lengthM = 0; const roads = new Set<number>();
  for (let p = to; p !== -1; p = prev[p] ?? -1) {
    cells.push(p); const r = grid.roadId[p] ?? -1; if (r >= 0) roads.add(r);
    const q = prev[p] ?? -1;
    if (q !== -1) lengthM += Math.hypot(p % grid.cols - q % grid.cols, Math.floor(p / grid.cols) - Math.floor(q / grid.cols)) * grid.cellM;
    if (p === from) break;
  }
  cells.reverse();
  return { a, b, cells, latlngs: cells.map(c => cellLatLng(grid, c)), lengthM, cost: dist[to] ?? Infinity, roadIds: [...roads] };
}
export function leastCostPath(grid: CostGrid, w: GeoWeights, a: number, b: number) {
  const s = grid.patches[a], t = grid.patches[b]; if (!s || !t || a === b) return null;
  const { dist, prev } = dijkstra(grid, w, s.center, [t.center]);
  return tracePath(grid, a, b, dist, prev);
}
export function centroidDistanceM(grid: CostGrid, a: number, b: number) {
  const p = grid.patches[a]?.centroid ?? [0, 0], q = grid.patches[b]?.centroid ?? [0, 0];
  return Math.hypot((p[0] - q[0]) * grid.mLat, (p[1] - q[1]) * grid.mLng);
}
function unionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i] ?? i] ?? i; i = parent[i] ?? i; } return i; };
  return { find, union: (a: number, b: number) => { const x = find(a), y = find(b); if (x === y) return false; parent[x] = y; return true; } };
}
/** Candidate links to k nearest neighbours, then a Kruskal MST over patch components, cheapest first. */
export function buildGeoNetwork(grid: CostGrid, w: GeoWeights, k = 4) {
  const n = grid.patches.length, targets = new Map<number, Set<number>>();
  for (let i = 0; i < n; i++) {
    const near = grid.patches.map((_, j) => j).filter(j => j !== i).sort((x, y) => centroidDistanceM(grid, i, x) - centroidDistanceM(grid, i, y)).slice(0, k);
    for (const j of near) { const a = Math.min(i, j), b = Math.max(i, j); if (!targets.has(a)) targets.set(a, new Set()); targets.get(a)?.add(b); }
  }
  const candidates: GeoCorridor[] = [];
  for (const [a, set] of targets) {
    const s = grid.patches[a]; if (!s) continue;
    const bs = [...set]; const { dist, prev } = dijkstra(grid, w, s.center, bs.map(b => grid.patches[b]?.center ?? 0));
    for (const b of bs) { const c = tracePath(grid, a, b, dist, prev); if (c) candidates.push(c); }
  }
  candidates.sort((x, y) => x.cost - y.cost);
  const uf = unionFind(n); for (const [a, b] of grid.initialUnion) uf.union(a, b);
  const mst = candidates.filter(c => uf.union(c.a, c.b));
  return { candidates, mst };
}
/** Component labels, plus the label of the component with the largest total area. */
export function componentsOf(grid: CostGrid, corridors: GeoCorridor[]) {
  const uf = unionFind(grid.patches.length);
  for (const [a, b] of grid.initialUnion) uf.union(a, b);
  for (const c of corridors) uf.union(c.a, c.b);
  const label = grid.patches.map((_, i) => uf.find(i)); const area = new Map<number, number>();
  label.forEach((l, i) => area.set(l, (area.get(l) ?? 0) + (grid.patches[i]?.areaHa ?? 0)));
  let largest = -1, best = -1; for (const [l, a] of area) if (a > best) { best = a; largest = l; }
  return { label, largest, count: area.size };
}
export function networkMetrics(grid: CostGrid, corridors: GeoCorridor[]) {
  const roads = new Set(corridors.flatMap(c => c.roadIds));
  return { before: componentsOf(grid, []).count, after: componentsOf(grid, corridors).count, lengthKm: corridors.reduce((s, c) => s + c.lengthM, 0) / 1000, roadsCrossed: roads.size, totalCost: corridors.reduce((s, c) => s + c.cost, 0) };
}
export function corridorsToGeoJSON(grid: CostGrid, corridors: GeoCorridor[]): FeatureCollection {
  return { type: 'FeatureCollection', features: corridors.map((c, i) => ({ type: 'Feature', properties: { rank: i + 1, from: grid.patches[c.a]?.name, to: grid.patches[c.b]?.name, length_m: Math.round(c.lengthM), cost: +c.cost.toFixed(2), roads_crossed: c.roadIds.length }, geometry: { type: 'LineString', coordinates: c.latlngs.map(([lat, lng]) => [lng, lat]) } })) };
}
/** RGBA pixels of the cost surface, low cost green -> high cost orange. */
export function costSurfaceImage(grid: CostGrid, w: GeoWeights) {
  const max = Math.max(w.open, w.road, w.building, w.water, w.vegetation);
  const px = new Uint8ClampedArray(grid.land.length * 4);
  for (let i = 0; i < grid.land.length; i++) {
    const t = Math.log(cellCost(grid.land[i] ?? 0, w)) / Math.log(max || 2);
    px[i * 4] = 40 + t * 200; px[i * 4 + 1] = 150 - t * 60; px[i * 4 + 2] = 80 - t * 50; px[i * 4 + 3] = 170;
  }
  return px;
}
