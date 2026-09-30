import { useEffect, useRef, useState } from 'react';
import { City, Network, WIDTH, HEIGHT } from '@/lib/corridor-simulation';

type Props = { city: City; network: Network; showLand?: boolean; showPatches?: boolean; showCorridors?: boolean; interactive?: boolean; comparison?: boolean; split?: number; onPatch?: (id: number | null, x: number, y: number) => void; className?: string };
const LAND_COLORS = ['#e6e0cc', '#6ba770', '#d6d6c9', '#aeb3aa', '#9ac5d4'];
export function CityCanvas({ city, network, showLand = true, showPatches = true, showCorridors = true, interactive = false, comparison = false, split = 50, onPatch, className = '' }: Props) {
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
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    ctx.fillStyle = '#e6e0cc'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (showLand) {
      for (let i = 0; i < city.grid.length; i++) {
        const kind = city.grid[i];
        if (kind === 1) {
          const variation = city.variation[i];
          ctx.fillStyle = variation > .68 ? '#4c8e5c' : variation > .59 ? '#69a46c' : '#83b57b';
        } else ctx.fillStyle = LAND_COLORS[kind];
        ctx.fillRect(i % WIDTH, Math.floor(i / WIDTH), 1.03, 1.03);
      }
    }
    if (showPatches) {
      ctx.fillStyle = 'rgba(33, 118, 64, .25)';
      for (const patch of city.patches) for (const cell of patch.cells) ctx.fillRect(cell % WIDTH, Math.floor(cell / WIDTH), 1, 1);
      ctx.strokeStyle = '#165c36'; ctx.lineWidth = .18;
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
        trace(); ctx.strokeStyle = 'rgba(255,255,255,.93)'; ctx.lineWidth = 1.75; ctx.stroke();
        trace(); ctx.strokeStyle = '#e07b1f'; ctx.lineWidth = .9; ctx.stroke();
      }
      if (comparison) ctx.restore();
    }
  }, [city, network, showLand, showPatches, showCorridors, comparison, split, width]);
  const pointer = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || !onPatch) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(WIDTH - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * WIDTH)));
    const y = Math.min(HEIGHT - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * HEIGHT)));
    onPatch(city.patchAt[y * WIDTH + x] ?? -1, event.clientX - rect.left, event.clientY - rect.top);
  };
  return <canvas ref={ref} className={`block w-full aspect-[8/5] ${interactive ? 'cursor-crosshair' : ''} ${className}`} role="img" aria-label={`Synthetic city map with ${city.patches.length} vegetation patches and ${network.corridors.length} ecological corridors`} onMouseMove={pointer} onClick={pointer} onMouseLeave={() => onPatch?.(null, 0, 0)} />;
}
