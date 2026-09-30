import { useEffect, useRef, useState } from 'react';
import { City, Network, WIDTH, HEIGHT } from '@/lib/corridor-simulation';

type Props = { city: City; network: Network; showLand?: boolean; showPatches?: boolean; showCorridors?: boolean; interactive?: boolean; comparison?: boolean; split?: number; theme?: string; onPatch?: (id: number | null, x: number, y: number) => void; className?: string };
const LAND_COLORS = ['--map-open', '--map-green-2', '--map-road', '--map-building', '--map-water'];
export function CityCanvas({ city, network, showLand = true, showPatches = true, showCorridors = true, interactive = false, comparison = false, split = 50, theme, onPatch, className = '' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width || 800));
    observer.observe(canvas); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const h = width * HEIGHT / WIDTH;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const colors = getComputedStyle(document.documentElement);
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    ctx.fillStyle = colors.getPropertyValue('--map-open'); ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (showLand) {
      for (let i = 0; i < city.grid.length; i++) {
        const kind = city.grid[i];
        if (kind === 1) {
          const variation = city.variation[i] ?? 0;
          ctx.fillStyle = colors.getPropertyValue(variation > .68 ? '--map-green-1' : variation > .59 ? '--map-green-2' : '--map-green-3');
        } else ctx.fillStyle = colors.getPropertyValue(LAND_COLORS[kind ?? 0] ?? '--map-open');
        ctx.fillRect(i % WIDTH, Math.floor(i / WIDTH), 1.03, 1.03);
      }
    }
    if (showPatches) {
      ctx.fillStyle = colors.getPropertyValue('--map-patch-fill');
      for (const patch of city.patches) for (const cell of patch.cells) ctx.fillRect(cell % WIDTH, Math.floor(cell / WIDTH), 1, 1);
      ctx.strokeStyle = colors.getPropertyValue('--map-patch-stroke'); ctx.lineWidth = .18;
      for (const patch of city.patches) for (const cell of patch.cells) {
        const x = cell % WIDTH, y = Math.floor(cell / WIDTH);
        if (x === 0 || city.patchAt[cell - 1] !== patch.id) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 1); ctx.stroke(); }
        if (x === WIDTH - 1 || city.patchAt[cell + 1] !== patch.id) { ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + 1); ctx.stroke(); }
        if (y === 0 || city.patchAt[cell - WIDTH] !== patch.id) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y); ctx.stroke(); }
        if (y === HEIGHT - 1 || city.patchAt[cell + WIDTH] !== patch.id) { ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + 1, y + 1); ctx.stroke(); }
      }
    }
    if (showCorridors) {
      if (comparison) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, WIDTH * split / 100, HEIGHT); ctx.clip(); }
      for (const corridor of network.corridors) {
        if (!corridor.path.length) continue;
        const trace = () => { ctx.beginPath(); corridor.path.forEach((cell, i) => { const x = cell % WIDTH + .5, y = Math.floor(cell / WIDTH) + .5; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        trace(); ctx.strokeStyle = colors.getPropertyValue('--map-casing'); ctx.lineWidth = 1.75; ctx.stroke();
        trace(); ctx.strokeStyle = colors.getPropertyValue('--map-corridor'); ctx.lineWidth = .9; ctx.stroke();
      }
      if (comparison) ctx.restore();
    }
  }, [city, network, showLand, showPatches, showCorridors, comparison, split, width, theme]);
  const pointer = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !onPatch) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(WIDTH - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * WIDTH)));
    const y = Math.min(HEIGHT - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * HEIGHT)));
    onPatch(city.patchAt[y * WIDTH + x] ?? -1, Math.max(8, Math.min(event.clientX - rect.left + 14, rect.width - 202)), event.clientY - rect.top);
  };
  return <canvas ref={ref} className={`block w-full aspect-[8/5] ${interactive ? 'cursor-crosshair' : ''} ${className}`} role="img" aria-label={`Synthetic city map with ${city.patches.length} vegetation patches and ${network.corridors.length} ecological corridors`} onMouseMove={pointer} onClick={pointer} onMouseLeave={() => onPatch?.(null, 0, 0)} />;
}
