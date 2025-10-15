// apps/frontend/src/main.tsx

// Importa React
import React from 'react';

// API moderna de ReactDOM para montar la app en el DOM del navegador (createRoot)
import ReactDOM from 'react-dom/client';

// Componente raíz de tu aplicación; dentro de App defines rutas, layouts, etc.
import App from './App';

// Proveedor del sistema de rutas. Debe envolver a <App />
// para que funcionen <Routes>, <Route>, <Link>, <Navigate>, etc.
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';

import { reportMetrics } from './utils/metrics';

// Busca el <div id="root"></div> en index.html, crea el “root” concurrente y renderiza.
// <React.StrictMode> activa comprobaciones extra en desarrollo.
// <BrowserRouter> habilita el enrutado basado en URL para toda la app.
// <App /> es tu árbol principal (donde se declaran las rutas).
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Expón un helper para ver métricas desde consola:
// window.reportMetrics()
if (typeof window !== 'undefined') {
  (window as any).reportMetrics = reportMetrics;
}