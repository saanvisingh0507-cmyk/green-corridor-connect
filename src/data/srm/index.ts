// SRM KTR case-study data. Each layer is a plain EPSG:4326 GeoJSON FeatureCollection
// loaded on demand with dynamic import(); replace the .geojson files with real OSM exports.
import { useEffect, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import type { Bounds } from '@/lib/geo-corridors';

export type SrmLayer = 'green' | 'water' | 'roads' | 'buildings';
export const SRM_BOUNDS: Bounds = { west: 80.02, south: 12.805, east: 80.065, north: 12.835 };
export const SRM_CENTER: [number, number] = [12.8205, 80.043];
export const SRM_ZOOM = 14;
export const CAMPUS_BOUNDS: [[number, number], [number, number]] = [[12.8195, 80.0395], [12.8275, 80.05]];

const loaders: Record<SrmLayer, () => Promise<{ default: string }>> = {
  green: () => import('./green.geojson?raw'),
  water: () => import('./water.geojson?raw'),
  roads: () => import('./roads.geojson?raw'),
  buildings: () => import('./buildings.geojson?raw'),
};
const cache = new Map<SrmLayer, Promise<FeatureCollection>>();
export function loadLayer(name: SrmLayer) {
  let p = cache.get(name);
  if (!p) {
    p = loaders[name]().then(m => {
      const fc = JSON.parse(m.default) as FeatureCollection;
      if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) throw new Error(`${name}.geojson is not a FeatureCollection`);
      return fc;
    });
    cache.set(name, p);
  }
  return p;
}
export const hasPlaceholder = (fc?: FeatureCollection) => !!fc?.features.some(f => (f.properties as Record<string, unknown> | null)?.placeholder === true);

/** Loads the requested layers once `enabled` becomes true. */
export function useSrmLayers(names: SrmLayer[], enabled = true) {
  const [data, setData] = useState<Partial<Record<SrmLayer, FeatureCollection>>>({});
  const key = names.join(',');
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    for (const n of names) loadLayer(n).then(fc => { if (live) setData(d => (d[n] === fc ? d : { ...d, [n]: fc })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return { data, loading: enabled && names.some(n => !data[n]) };
}
