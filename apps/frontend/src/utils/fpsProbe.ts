// apps/frontend/src/utils/fpsProbe.ts
export function startFpsProbe(label = 'fps') {
  let last = performance.now(), frames = 0, raf = 0 as any;
  function loop(t:number) {
    frames++;
    if (t - last >= 1000) {
      const fps = Math.round((frames * 1000) / (t - last));
      console.log(`[FPS] ${label}: ${fps}`);
      frames = 0; last = t;
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}