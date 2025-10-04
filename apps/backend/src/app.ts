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

// Endpoints CRUD de columnas y registros
import fieldsRouter from './routes/fields.routes.js';
import recordsRouter from './routes/records.routes.js';

import auditRoutes from './routes/audit.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

// --- ajustes seguros / performance (no rompen FE) ---
app.disable('x-powered-by');
app.set('trust proxy', 1); // por si algún día hay proxy / https

// CORS (permite tu FRONTEND y los localhost típicos de dev)
const FRONTEND = process.env.FRONTEND_ORIGIN;
const allowed = new Set(
  [FRONTEND, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean) as string[]
);
app.use(
  cors({
    origin(origin, cb) {
      // permitir herramientas sin Origin (curl/postman)
      if (!origin) return cb(null, true);
      return cb(null, allowed.has(origin));
    },
    credentials: true,
  })
);

// Seguridad de cabeceras sin CSP (para no interferir en dev)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Compresión de respuestas grandes (lista de registros, etc.)
app.use(compression());

// Body & cookies
app.use(express.json({ limit: '1mb' })); // subimos un poco el límite por comodidad
app.use(cookieParser());

// ---------- rutas ----------
app.use('/health', healthRouter);
app.use('/db', dbRouter);
app.use('/auth', authRouter);
app.use('/users', usersRouter);

// /bases/*
app.use('/bases', membersRouter);
app.use('/bases', basesRouter);
app.use('/bases', tablesRouter);

// /workspaces/*
app.use('/workspaces', workspacesRouter);

// Rutas anidadas de tablas (cada subrouter ya usa mergeParams:true)
app.use('/bases/:baseId/tables/:tableId/fields', fieldsRouter);
app.use('/bases/:baseId/tables/:tableId/records', recordsRouter);

// Auditoría
app.use('/', auditRoutes);

// Manejo de errores (siempre al final)
app.use(errorHandler);

export default app;