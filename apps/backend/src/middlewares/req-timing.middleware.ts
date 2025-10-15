import type { Request, Response, NextFunction } from 'express';

type Sample = { dur: number };
const hist = new Map<string, Sample[]>();

function pushSample(key: string, dur: number) {
  const arr = hist.get(key) || [];
  arr.push({ dur });
  if (arr.length > 200) arr.shift(); // ventana simple
  hist.set(key, arr);
}

function percentile(arr: number[], q: number) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * q);
  return sorted[idx];
}

export function reqTimingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  let bytes = 0;
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  (res as any).write = (chunk: any, ...args: any[]) => {
    if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    return origWrite(chunk, ...args);
  };
  (res as any).end = (chunk: any, ...args: any[]) => {
    if (chunk) bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    return origEnd(chunk, ...args);
  };

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durMs = Number(end - start) / 1e6;

    const routeKey = `${req.method} ${req.route?.path || req.path}`;
    pushSample(routeKey, durMs);

    const arr = (hist.get(routeKey) || []).map(s => s.dur);
    const p50 = percentile(arr, 0.5).toFixed(1);
    const p95 = percentile(arr, 0.95).toFixed(1);

    // log estructurado
    console.log(JSON.stringify({
      t: new Date().toISOString(),
      rid: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durMs: +durMs.toFixed(1),
      sizeB: bytes,
      p50: +p50,
      p95: +p95,
    }));
  });

  next();
}