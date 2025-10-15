// apps/frontend/src/utils/metrics.ts
type Sample = { name: string; dur: number; t: number };

const enabled = (() => {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(location.search).get('metrics');
  if (q === '1') return true;
  return localStorage.getItem('METRICS') === '1';
})();

const buf: Sample[] = [];

export function metricMark(id: string) {
  if (!enabled || typeof performance === 'undefined') return;
  performance.mark(`${id}-start`);
}

export function metricMeasure(id: string) {
  if (!enabled || typeof performance === 'undefined') return 0;
  const start = `${id}-start`, end = `${id}-end`;
  performance.mark(end);
  const [m] = performance.measure(id, start, end) as any;
  const dur = m?.duration ?? 0;
  buf.push({ name: id, dur, t: Date.now() });
  console.log(`[METRIC] ${id}: ${dur.toFixed(1)} ms`);
  return dur;
}

export async function measureAsync<T>(id: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const dur = performance.now() - t0;
    buf.push({ name: id, dur, t: Date.now() });
    console.log(`[METRIC] ${id}: ${dur.toFixed(1)} ms`);
  }
}

export function reportMetrics() {
  if (!enabled) { console.log('Metrics disabled'); return; }
  const by = new Map<string, number[]>();
  for (const s of buf) {
    const arr = by.get(s.name) || [];
    arr.push(s.dur);
    by.set(s.name, arr);
  }
  const rows = [...by.entries()].map(([name, arr]) => {
    const sorted = arr.slice().sort((a,b)=>a-b);
    const p = (q:number)=> sorted[Math.floor((sorted.length-1)*q)]||0;
    const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
    return {
      name,
      n: arr.length,
      avg: +avg.toFixed(1),
      p50: +p(0.5).toFixed(1),
      p95: +p(0.95).toFixed(1),
      max: +sorted[sorted.length-1].toFixed(1)
    };
  });
  console.table(rows);
}

// Opcional: acceso alternativo
if (typeof window !== 'undefined') {
  (window as any).__MBQ_METRICS__ = { reportMetrics };
}