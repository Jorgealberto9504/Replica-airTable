// apps/backend/src/index.ts
import 'dotenv/config';
import app from './app.js';
import { startTrashPurgeJob } from './jobs/trash-purge.job.js';
import { verifyMailer } from './services/mailer.js';
import { initRealtime } from './realtime/hub.js';

const PORT = Number(process.env.PORT ?? 8080);

// Arrancamos HTTP y luego acoplamos Socket.IO
const server = app.listen(PORT, () => {
  console.log(`[server] API escuchando en http://localhost:${PORT} (${process.env.NODE_ENV ?? 'dev'})`);
  // Realtime
  initRealtime(server);

  // Job de limpieza de papelera
  startTrashPurgeJob();

  // Verificar SMTP (no bloquea el arranque)
  verifyMailer().catch((e) => {
    console.error('[mailer] No se pudo verificar SMTP:', e?.message ?? e);
  });
});

// Apagado elegante
function shutdown(signal: string) {
  console.log(`[server] Señal ${signal} recibida. Cerrando servidor HTTP...`);
  server.close((err?: Error) => {
    if (err) {
      console.error('[server] Error al cerrar:', err);
      process.exit(1);
    }
    console.log('[server] Servidor cerrado correctamente.');
    process.exit(0);
  });
}

['SIGINT', 'SIGTERM'].forEach((sig) =>
  process.on(sig as NodeJS.Signals, () => shutdown(sig))
);

process.on('unhandledRejection', (reason) => {
  console.error('[node] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[node] Uncaught exception:', err);
});