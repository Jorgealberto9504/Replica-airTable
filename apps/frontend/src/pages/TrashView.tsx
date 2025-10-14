// apps/frontend/src/pages/TrashView.tsx
import { useEffect, useState, useCallback } from 'react';
import Header from '../components/Header';
import { useAuth } from '../auth/AuthContext';
import {
  listMyTrashedBases, restoreBase, deleteBasePermanent, emptyMyBaseTrash,
  listTrashedTablesForBase, restoreTable, deleteTablePermanent, emptyTableTrash,
  listMyTrashedWorkspacesSafe, restoreWorkspace, deleteWorkspacePermanent, emptyWorkspaceTrash,
  listAllTrashedTablesAdmin, restoreTableAdmin, deleteTablePermanentAdmin,
} from '../api/trash';
import { listBases } from '../api/bases';
import { confirmToast } from '../ui/confirmToast';

type Tab = 'workspaces' | 'bases' | 'tables';

interface BaseItem {
  id: number;
  name: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  trashedAt?: string;
}

interface WorkspaceItem {
  id: number;
  name: string;
  trashedAt?: string;
}

interface TableTrashItemUI {
  id: number;
  name: string;
  trashedAt?: string;
  baseId: number;
  baseName: string;
  ownerName?: string;
  isAdmin: boolean;
}

export default function TrashView() {
  const { user, logout } = useAuth();
  const isAdmin = user?.platformRole === 'SYSADMIN';

  const [activeTab, setActiveTab] = useState<Tab>('bases');
  const [bases, setBases] = useState<BaseItem[]>([]);
  const [tables, setTables] = useState<TableTrashItemUI[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [workspacesAvailable, setWorkspacesAvailable] = useState(true);
  const [loading, setLoading] = useState({
    workspaces: false,
    bases: false,
    tables: false,
  });

  // Helpers
  const formatDate = (dateString?: string) =>
    dateString ? new Date(dateString).toLocaleString() : '—';

  const confirmDelete = useCallback(async (title: string, body: string | React.ReactNode) => {
    return await confirmToast({
      title,
      body,
      confirmText: 'Borrar',
      cancelText: 'Cancelar',
      danger: true,
    });
  }, []);

  const confirmEmpty = useCallback(async (title: string, body: string) => {
    return await confirmToast({
      title,
      body,
      confirmText: 'Vaciar',
      cancelText: 'Cancelar',
      danger: true,
    });
  }, []);

  // Cargar bases
  const loadBases = useCallback(async () => {
    setLoading(prev => ({ ...prev, bases: true }));
    try {
      const response = await listMyTrashedBases();
      setBases(response.bases || []);
    } catch (error) {
      console.error('Error loading bases:', error);
      setBases([]);
    } finally {
      setLoading(prev => ({ ...prev, bases: false }));
    }
  }, []);

  // Cargar tablas (admin/global o por base)
  const loadTablesAll = useCallback(async () => {
    setLoading(prev => ({ ...prev, tables: true }));
    try {
      if (isAdmin) {
        const response = await listAllTrashedTablesAdmin();
        const tablesData: TableTrashItemUI[] = (response.tables || []).map(table => ({
          id: table.id,
          name: table.name,
          trashedAt: table.trashedAt,
          baseId: table.base.id,
          baseName: table.base.name,
          ownerName: table.base.owner?.fullName,
          isAdmin: true,
        }));
        setTables(tablesData);
      } else {
        const basesResponse = await listBases({ page: 1, pageSize: 500 });
        const basesMap = new Map(
          basesResponse.bases.map(base => [
            base.id,
            {
              name: base.name,
              ownerName: (base as any).owner?.fullName ?? (base as any).ownerName,
            },
          ])
        );

        const perBase = await Promise.all(
          basesResponse.bases.map(async base => {
            try {
              const response = await listTrashedTablesForBase(base.id);
              return (response.tables || []).map(table => ({
                id: table.id,
                name: table.name,
                trashedAt: table.trashedAt,
                baseId: base.id,
                baseName: basesMap.get(base.id)?.name || `Base ${base.id}`,
                ownerName: basesMap.get(base.id)?.ownerName,
                isAdmin: false,
              } as TableTrashItemUI));
            } catch {
              return [] as TableTrashItemUI[];
            }
          })
        );

        setTables(perBase.flat());
      }
    } catch (error) {
      console.error('Error loading tables:', error);
      setTables([]);
    } finally {
      setLoading(prev => ({ ...prev, tables: false }));
    }
  }, [isAdmin]);

  // Cargar workspaces (si endpoint existe)
  const loadWorkspaces = useCallback(async () => {
    setLoading(prev => ({ ...prev, workspaces: true }));
    try {
      const response = await listMyTrashedWorkspacesSafe();
      if ((response as any).ok === false) {
        setWorkspacesAvailable(false);
        setWorkspaces([]);
      } else {
        setWorkspaces((response as any).workspaces || []);
        setWorkspacesAvailable(true);
      }
    } catch (error) {
      console.error('Error loading workspaces:', error);
      setWorkspacesAvailable(false);
      setWorkspaces([]);
    } finally {
      setLoading(prev => ({ ...prev, workspaces: false }));
    }
  }, []);

  // Vaciar papelera de tablas
  const handleEmptyAllTablesTrash = useCallback(async () => {
    const confirmed = await confirmEmpty(
      'Vaciar papelera de tablas',
      'Se eliminarán DEFINITIVAMENTE todas las tablas listadas. Esta acción no se puede deshacer.'
    );
    if (!confirmed) return;

    try {
      if (isAdmin) {
        for (const t of tables) {
          try {
            await deleteTablePermanentAdmin(t.baseId, t.id);
          } catch {}
        }
      } else {
        const baseIds = Array.from(new Set(tables.map(t => t.baseId)));
        for (const baseId of baseIds) {
          try {
            await emptyTableTrash(baseId);
          } catch {}
        }
      }
      await loadTablesAll();
    } catch (error) {
      console.error('Error emptying tables trash:', error);
    }
  }, [tables, isAdmin, loadTablesAll, confirmEmpty]);

  // Cargar según pestaña activa
  useEffect(() => {
    switch (activeTab) {
      case 'workspaces':
        loadWorkspaces();
        break;
      case 'bases':
        loadBases();
        break;
      case 'tables':
        loadTablesAll();
        break;
    }
  }, [activeTab, loadWorkspaces, loadBases, loadTablesAll]);

  // UI helpers
  const TabButton = ({ tab, label }: { tab: Tab; label: string }) => (
    <button
      className={`chip ${activeTab === tab ? 'active' : ''}`}
      aria-pressed={activeTab === tab}
      onClick={() => setActiveTab(tab)}
    >
      {label}
    </button>
  );

  const renderEmpty = (msg: string) => <div className="card">{msg}</div>;
  const renderLoading = () => <div className="card">Cargando…</div>;

  return (
    <>
      <Header user={user ?? undefined} onLogout={logout} />
      <main className="content">
        <div className="list-toolbar mt-5">
          <h2 className="section-title m-0">Papelera de reciclaje</h2>
        </div>

        <div className="flex gap-2 mb-3">
          {workspacesAvailable && <TabButton tab="workspaces" label="Workspaces" />}
          <TabButton tab="bases" label="Bases" />
          <TabButton tab="tables" label="Tablas" />
        </div>

        {/* Workspaces */}
        {activeTab === 'workspaces' && (
          <section>
            {!workspacesAvailable
              ? renderEmpty('Workspaces no disponible.')
              : loading.workspaces
              ? renderLoading()
              : workspaces.length === 0
              ? renderEmpty('No hay workspaces en la papelera.')
              : (
                <>
                  <div className="bases-grid">
                    {workspaces.map(w => (
                      <div key={w.id} className="base-card">
                        <div className="base-card-head">
                          <div className="base-card-title">{w.name}</div>
                        </div>
                        <div className="base-card-meta">Eliminado: {formatDate(w.trashedAt)}</div>
                        <div className="flex gap-2 mt-2">
                          <button
                            className="btn"
                            onClick={async () => { await restoreWorkspace(w.id); await loadWorkspaces(); }}
                          >
                            Restaurar
                          </button>
                          <button
                            className="btn-danger"
                            onClick={async () => {
                              const confirmed = await confirmDelete(
                                'Borrar definitivamente',
                                <>Se eliminará el workspace <b>{w.name}</b> y no se podrá recuperar.</>
                              );
                              if (!confirmed) return;
                              await deleteWorkspacePermanent(w.id);
                              await loadWorkspaces();
                            }}
                          >
                            Borrar definitivo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pagination">
                    <button
                      className="btn-danger"
                      onClick={async () => {
                        const confirmed = await confirmEmpty(
                          'Vaciar papelera de workspaces',
                          'Se eliminarán definitivamente todos los workspaces de tu papelera.'
                        );
                        if (!confirmed) return;
                        await emptyWorkspaceTrash();
                        await loadWorkspaces();
                      }}
                    >
                      Vaciar papelera de workspaces
                    </button>
                  </div>
                </>
              )}
          </section>
        )}

        {/* Bases */}
        {activeTab === 'bases' && (
          <section>
            {loading.bases
              ? renderLoading()
              : bases.length === 0
              ? renderEmpty('No hay bases en la papelera.')
              : (
                <>
                  <div className="bases-grid">
                    {bases.map(b => (
                      <div key={b.id} className="base-card">
                        <div className="base-card-head">
                          <div className="base-card-title">{b.name}</div>
                        </div>
                        <div className="base-card-meta">
                          {b.visibility === 'PUBLIC' ? 'Pública' : 'Privada'} · Eliminada: {formatDate(b.trashedAt)}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button className="btn" onClick={async () => { await restoreBase(b.id); await loadBases(); }}>
                            Restaurar
                          </button>
                          <button
                            className="btn-danger"
                            onClick={async () => {
                              const confirmed = await confirmDelete(
                                'Borrar definitivamente',
                                <>¿Eliminar la base <b>{b.name}</b> de forma permanente?</>
                              );
                              if (!confirmed) return;
                              await deleteBasePermanent(b.id);
                              await loadBases();
                            }}
                          >
                            Borrar definitivo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pagination">
                    <button
                      className="btn-danger"
                      onClick={async () => {
                        const confirmed = await confirmEmpty(
                          'Vaciar papelera de bases',
                          'Se eliminarán definitivamente todas las bases de tu papelera.'
                        );
                        if (!confirmed) return;
                        await emptyMyBaseTrash();
                        await loadBases();
                      }}
                    >
                      Vaciar papelera de bases
                    </button>
                  </div>
                </>
              )}
          </section>
        )}

        {/* Tablas */}
        {activeTab === 'tables' && (
          <section>
            {loading.tables
              ? renderLoading()
              : tables.length === 0
              ? renderEmpty('No hay tablas en la papelera.')
              : (
                <>
                  <div className="bases-grid">
                    {tables.map(t => (
                      <div key={`${t.baseId}-${t.id}`} className="base-card">
                        <div className="base-card-head">
                          <div className="base-card-title">{t.name}</div>
                        </div>
                        <div className="base-card-meta">
                          Eliminada: {formatDate(t.trashedAt)} · <b>Base:</b> {t.baseName}
                          {t.ownerName && <> · <b>Dueño:</b> {t.ownerName}</>}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            className="btn"
                            onClick={async () => {
                              if (t.isAdmin) await restoreTableAdmin(t.baseId, t.id);
                              else await restoreTable(t.baseId, t.id);
                              await loadTablesAll();
                            }}
                          >
                            Restaurar
                          </button>
                          <button
                            className="btn-danger"
                            onClick={async () => {
                              const confirmed = await confirmDelete(
                                'Borrar definitivamente',
                                <>¿Eliminar la tabla <b>{t.name}</b> de forma permanente?</>
                              );
                              if (!confirmed) return;
                              if (t.isAdmin) await deleteTablePermanentAdmin(t.baseId, t.id);
                              else await deleteTablePermanent(t.baseId, t.id);
                              await loadTablesAll();
                            }}
                          >
                            Borrar definitivo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pagination mt-4">
                    <button className="btn-danger" onClick={handleEmptyAllTablesTrash}>
                      Vaciar papelera de tablas
                    </button>
                  </div>
                </>
              )}
          </section>
        )}
      </main>
    </>
  );
}