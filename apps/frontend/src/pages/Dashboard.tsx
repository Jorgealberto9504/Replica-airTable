import { Navigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';

import Header from '../components/Header';
import AdminRegisterModal from './components/AdminRegisterModal';
import WorkspaceSidebar from './components/WorkspaceSidebar';
import BaseGrid from './components/BaseGrid';
import CreateWorkspaceModal from './components/CreateWorkspaceModal';
import CreateBaseModal from './components/CreateBaseModal';

import { useAuth } from '../auth/AuthContext';
import { listMyWorkspaces, listBasesForWorkspace } from '../api/workspaces';

export default function Dashboard() {
  const { user: me, loading, logout } = useAuth();

  const [selectedWs, setSelectedWs] = useState<number | null>(null);
  const [openRegister, setOpenRegister] = useState(false);
  const [openCreateWs, setOpenCreateWs] = useState(false);
  const [openCreateBase, setOpenCreateBase] = useState(false);

  const [qBases, setQBases] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  if (loading) {
    return (
      <div className="page-center">
        <div className="card p-6">
          <h2 className="section-title mb-2">Verificando sesión…</h2>
          <p className="muted">Un momento por favor.</p>
        </div>
      </div>
    );
  }

  if (!me) return <Navigate to="/login" replace />;

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      window.location.href = '/login';
    }
  }, [logout]);

  useEffect(() => {
    (async () => {
      try {
        const resp = await listMyWorkspaces();
        setSelectedWs(resp.workspaces[0]?.id ?? 0);
      } catch {
        setSelectedWs(0);
      }
    })();
  }, []);

  const canCreate = me.platformRole === 'SYSADMIN' || !!(me as any).canCreateBases;

  const refreshAfterCreate = useCallback(async () => {
    if (selectedWs) {
      await listBasesForWorkspace(selectedWs).catch(() => {});
    }
    setReloadKey((k) => k + 1);
  }, [selectedWs]);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header sticky global */}
      <Header
        user={me}
        onLogout={handleLogout}
        onOpenRegister={() => setOpenRegister(true)}
        searchBox={{
          value: qBases,
          onChange: setQBases,
          placeholder: 'Buscar bases…',
        }}
      />

      {/* Shell con sidebar fija bajo el header */}
      <div className="workspace-shell">
        {/* Sidebar Workspaces */}
        <aside className="workspace-sidebar bg-white border-r border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h1 className="text-xl font-bold text-gray-800">Workspaces</h1>
          </div>
          <div className="h-2" />
          <WorkspaceSidebar
            selectedId={selectedWs}
            onSelect={setSelectedWs}
            onOpenCreate={() => setOpenCreateWs(true)}
            canCreate={canCreate}
          />
        </aside>

        {/* Contenido */}
        <main className="workspace-content">
          <div className="content py-6">
            <div className="bg-white rounded-card border border-gray-200 shadow-sm overflow-hidden">
              <BaseGrid
                workspaceId={selectedWs}
                onCreateBase={() => setOpenCreateBase(true)}
                canCreate={canCreate}
                query={qBases}
                showInlineSearch={false}
                reloadKey={reloadKey}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Modales */}
      <AdminRegisterModal
        open={openRegister}
        onClose={() => setOpenRegister(false)}
      />
      <CreateWorkspaceModal
        open={openCreateWs}
        onClose={() => setOpenCreateWs(false)}
        onCreated={refreshAfterCreate}
      />
      <CreateBaseModal
        open={openCreateBase}
        onClose={() => setOpenCreateBase(false)}
        workspaceId={selectedWs}
        onCreated={refreshAfterCreate}
      />
    </div>
  );
}