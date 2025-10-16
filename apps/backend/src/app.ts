// apps/backend/src/app.ts
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';

import healthRouter from './routes/health.routes.js';
import dbRouter from './routes/db.routes.js';
import authRouter from './routes/auth.routes.js';
import usersRouter from './routes/users.routes.js';
import membersRouter from './routes/members.routes.js';
import basesRouter from './routes/bases.routes.js';
import tablesRouter from './routes/tables.routes.js';
import workspacesRouter from './routes/workspaces.routes.js';
import fieldsRouter from './routes/fields.routes.js';
import recordsRouter from './routes/records.routes.js';
import auditRoutes from './routes/audit.routes.js';
import commentsRouter from './routes/comments.routes.js'; // 👈 NUEVO

import { errorHandler } from './middlewares/error.middleware.js';
import { requestIdMiddleware } from './middlewares/request-id.middleware.js';
import { reqTimingMiddleware } from './middlewares/req-timing.middleware.js';

const app = express();

// Diagnóstico
app.use(requestIdMiddleware);
app.use(reqTimingMiddleware);

// Hardening / proxies
app.disable('x-powered-by');
app.set('trust proxy', 1);

// CORS
const FRONTEND = process.env.FRONTEND_ORIGIN;
const allowed = new Set(
  [FRONTEND, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean) as string[]
);
const corsOpts: cors.CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/postman
    return cb(null, allowed.has(origin));
  },
  credentials: true,
};
app.use(cors(corsOpts));

// Seguridad
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Compresión + body + cookies
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Rutas
app.use('/health', healthRouter);
app.use('/db', dbRouter);
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/bases', membersRouter);
app.use('/bases', basesRouter);
app.use('/bases', tablesRouter);
app.use('/workspaces', workspacesRouter);
app.use('/bases/:baseId/tables/:tableId/fields', fieldsRouter);
app.use('/bases/:baseId/tables/:tableId/records', recordsRouter);
app.use('/bases/:baseId/tables/:tableId/records/:recordId/comments', commentsRouter); // 👈 MONTA COMENTARIOS
app.use('/', auditRoutes);

// Errores (al final)
app.use(errorHandler);

export default app;