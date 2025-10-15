export async function withTiming<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = process.hrtime.bigint();
  try {
    return await fn();
  } finally {
    const end = process.hrtime.bigint();
    const durMs = Number(end - start) / 1e6;
    console.log(JSON.stringify({ t: new Date().toISOString(), kind: 'section', name, durMs: +durMs.toFixed(1) }));
  }
}