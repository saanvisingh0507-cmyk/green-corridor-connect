export const WIDTH = 160;
export const HEIGHT = 100;
export const CELL_METERS = 10;
export type Land = 0 | 1 | 2 | 3 | 4; // open, vegetation, road, building, water
export type Resistances = { open: number; vegetation: number; road: number; building: number; water: number };
export const DEFAULT_RESISTANCE: Resistances = { open: 3, vegetation: 1, road: 8, building: 10, water: 40 };
export type Patch = { id: number; cells: number[]; center: number; area: number };
export type City = { seed: number; grid: Uint8Array; variation: Float32Array; patches: Patch[]; patchAt: Int16Array };
export type Corridor = { a: number; b: number; path: number[]; cost: number; length: number; roads: number };
export type Network = { corridors: Corridor[]; candidates: Corridor[]; before: number; after: number; lengthKm: number; roadsCrossed: number; totalCost: number };

function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1442695041, 1274126177) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, scale: number, seed: number) {
  const gx = x / scale, gy = y / scale, ix = Math.floor(gx), iy = Math.floor(gy);
  const u = (gx - ix) ** 2 * (3 - 2 * (gx - ix));
  const v = (gy - iy) ** 2 * (3 - 2 * (gy - iy));
  const a = hash(ix, iy, seed) * (1 - u) + hash(ix + 1, iy, seed) * u;
  const b = hash(ix, iy + 1, seed) * (1 - u) + hash(ix + 1, iy + 1, seed) * u;
  return a * (1 - v) + b * v;
}
export function generateCity(seed: number): City {
  const grid = new Uint8Array(WIDTH * HEIGHT);
  const variation = new Float32Array(grid.length);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const i = y * WIDTH + x;
    const n = noise(x, y, 17, seed) * .62 + noise(x, y, 7, seed + 19) * .28 + noise(x, y, 37, seed + 43) * .1;
    variation[i] = n;
    const riverX = 111 + Math.sin(y * .085 + seed * .13) * 9 + Math.sin(y * .19) * 2;
    const river = Math.abs(x - riverX) < 3.2;
    const roadV = Math.abs((x + 3) % 24 - 12) < 1.1;
    const roadH = Math.abs((y + 5) % 21 - 10) < 1.1;
    const arterial = Math.abs(y - 51) < 1.5 || Math.abs(x - 76) < 1.5;
    const road = roadV || roadH || arterial;
    const urban = Math.hypot((x - 72) / 75, (y - 51) / 60);
    const building = urban < .85 && hash(Math.floor(x / 4), Math.floor(y / 4), seed + 92) > .24 && n < .68;
    let land: Land = n > .53 ? 1 : 0;
    if (urban < .95 && building) land = 3;
    if (road) land = 2;
    if (river) land = 4;
    if (river && (Math.abs(y - 51) < 2 || Math.abs(y - 16) < 2 || Math.abs(y - 83) < 2)) land = 2;
    grid[i] = land;
  }
  const patchAt = new Int16Array(grid.length).fill(-1);
  const visited = new Uint8Array(grid.length);
  const patches: Patch[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== 1 || visited[i]) continue;
    const queue = [i]; visited[i] = 1;
    for (let q = 0; q < queue.length; q++) {
      const p = queue[q], x = p % WIDTH, y = Math.floor(p / WIDTH);
      const neighbors = [x > 0 ? p - 1 : -1, x < WIDTH - 1 ? p + 1 : -1, y > 0 ? p - WIDTH : -1, y < HEIGHT - 1 ? p + WIDTH : -1];
      for (const next of neighbors) if (next >= 0 && grid[next] === 1 && !visited[next]) { visited[next] = 1; queue.push(next); }
    }
    if (queue.length < 18) continue;
    const cx = queue.reduce((sum, p) => sum + p % WIDTH, 0) / queue.length;
    const cy = queue.reduce((sum, p) => sum + Math.floor(p / WIDTH), 0) / queue.length;
    let center = queue[0], best = Infinity;
    for (const p of queue) { const d = (p % WIDTH - cx) ** 2 + (Math.floor(p / WIDTH) - cy) ** 2; if (d < best) { best = d; center = p; } }
    const id = patches.length;
    for (const p of queue) patchAt[p] = id;
    patches.push({ id, cells: queue, center, area: queue.length * .01 });
  }
  // Keep the largest patches for a legible network and bounded computation.
  patches.sort((a, b) => b.cells.length - a.cells.length);
  const retained = patches.slice(0, 18);
  patchAt.fill(-1);
  retained.forEach((patch, id) => { patch.id = id; for (const p of patch.cells) patchAt[p] = id; });
  return { seed, grid, variation, patches: retained, patchAt };
}
class MinHeap {
  private data: [number, number][] = [];
  push(item: [number, number]) { const a = this.data; let i = a.length; a.push(item); while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= item[0]) break; a[i] = a[p]; i = p; } a[i] = item; }
  pop(): [number, number] | undefined { const a = this.data; if (!a.length) return; const first = a[0], last = a.pop(); if (a.length && last) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= last[0]) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
  get size() { return this.data.length; }
}
function cellCost(land: number, r: Resistances) { return land === 1 ? r.vegetation : land === 2 ? r.road : land === 3 ? r.building : land === 4 ? r.water : r.open; }
function route(city: City, from: number, to: number, resistance: Resistances): Omit<Corridor, 'a' | 'b'> | null {
  const dist = new Float64Array(city.grid.length).fill(Infinity);
  const prev = new Int32Array(city.grid.length).fill(-1);
  const heap = new MinHeap(); dist[from] = 0; heap.push([0, from]);
  const dirs = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  while (heap.size) {
    const current = heap.pop(); if (!current) break;
    const [cost, p] = current;
    if (cost > dist[p]) continue;
    if (p === to) break;
    const x = p % WIDTH, y = Math.floor(p / WIDTH);
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
      const next = ny * WIDTH + nx;
      const step = Math.hypot(dx, dy) * (cellCost(city.grid[p], resistance) + cellCost(city.grid[next], resistance)) / 2;
      const candidate = cost + step;
      if (candidate < dist[next]) { dist[next] = candidate; prev[next] = p; heap.push([candidate, next]); }
    }
  }
  if (!Number.isFinite(dist[to])) return null;
  const path: number[] = []; let length = 0, roads = 0;
  for (let p = to; p !== -1; p = prev[p]) {
    path.push(p);
    if (city.grid[p] === 2) roads++;
    if (prev[p] !== -1) length += Math.hypot(p % WIDTH - prev[p] % WIDTH, Math.floor(p / WIDTH) - Math.floor(prev[p] / WIDTH)) * CELL_METERS;
  }
  path.reverse();
  return { path, cost: dist[to], length, roads };
}
export function buildNetwork(city: City, resistance: Resistances = DEFAULT_RESISTANCE, limit?: number): Network {
  const pairs = new Set<string>();
  city.patches.forEach((patch, i) => {
    city.patches.map((other, j) => ({ j, distance: Math.hypot(patch.center % WIDTH - other.center % WIDTH, Math.floor(patch.center / WIDTH) - Math.floor(other.center / WIDTH)) }))
      .filter(({ j }) => j !== i).sort((a, b) => a.distance - b.distance).slice(0, 4).forEach(({ j }) => pairs.add(`${Math.min(i, j)}-${Math.max(i, j)}`));
  });
  const candidates: Corridor[] = [];
  for (const pair of pairs) {
    const [a, b] = pair.split('-').map(Number);
    const found = route(city, city.patches[a].center, city.patches[b].center, resistance);
    if (found) candidates.push({ a, b, ...found });
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const parent = city.patches.map((_, i) => i);
  const root = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const mst: Corridor[] = [];
  for (const edge of candidates) {
    const a = root(edge.a), b = root(edge.b);
    if (a !== b) { parent[a] = b; mst.push(edge); }
  }
  const selected = mst.slice(0, limit ?? mst.length);
  const components = city.patches.map((_, i) => i);
  const componentRoot = (i: number): number => { while (components[i] !== i) i = components[i]; return i; };
  for (const edge of selected) components[componentRoot(edge.a)] = componentRoot(edge.b);
  const crossed = new Set<number>();
  for (const edge of selected) for (const cell of edge.path) if (city.grid[cell] === 2) crossed.add(cell);
  return { corridors: selected, candidates: mst, before: city.patches.length, after: new Set(city.patches.map((_, i) => componentRoot(i))).size,
    lengthKm: selected.reduce((sum, c) => sum + c.length, 0) / 1000, roadsCrossed: crossed.size, totalCost: selected.reduce((sum, c) => sum + c.cost, 0) };
}
export function connectedToLargest(city: City, network: Network, patchId: number) {
  if (!city.patches.length) return false;
  const seen = new Set([0]); let changed = true;
  while (changed) { changed = false; for (const edge of network.corridors) {
    if (seen.has(edge.a) && !seen.has(edge.b)) { seen.add(edge.b); changed = true; }
    if (seen.has(edge.b) && !seen.has(edge.a)) { seen.add(edge.a); changed = true; }
  } }
  return seen.has(patchId);
}
