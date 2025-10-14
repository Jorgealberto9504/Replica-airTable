import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState, useCallback } from 'react';
import logo from '../assets/mbq-logo.png';

type User = {
  fullName?: string;
  email?: string;
  platformRole?: 'USER' | 'SYSADMIN';
  canCreateBases?: boolean;
};

type SearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

type Props = {
  user?: User;
  onLogout: () => void;
  onOpenRegister?: () => void; // solo visible si es admin
  searchBox?: SearchBoxProps;
};

export default function Header({ user, onLogout, onOpenRegister, searchBox }: Props) {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isAdmin = user?.platformRole === 'SYSADMIN';
  const canSeeTrash = isAdmin || !!user?.canCreateBases;

  const userInitial = useMemo(() => {
    const name = (user?.fullName || user?.email || '').trim();
    return name ? name[0].toUpperCase() : 'U';
  }, [user?.fullName, user?.email]);

  const toggleMenu = useCallback(() => setIsMenuOpen(prev => !prev), []);
  const closeMenu  = useCallback(() => setIsMenuOpen(false), []);
  const handleMenuAction = useCallback((action: () => void) => { closeMenu(); action(); }, [closeMenu]);

  const handleNavigation = useCallback((path: string) => {
    handleMenuAction(() => navigate(path));
  }, [handleMenuAction, navigate]);

  const handleLogout = useCallback(() => {
    handleMenuAction(onLogout);
  }, [handleMenuAction, onLogout]);

  const renderSearchBox = () => {
    if (!searchBox) return <div className="flex-1" />;
    return (
      <div className="flex-1 max-w-2xl mx-6 md:mx-10">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-azulMedio focus:border-azulMedio focus:outline-none shadow-sm transition-colors"
            placeholder={searchBox.placeholder ?? 'Buscar…'}
            value={searchBox.value}
            onChange={(e) => searchBox.onChange(e.target.value)}
          />
        </div>
      </div>
    );
  };

  const renderAdminZone = () => (
    <div className="flex items-center gap-3">
      {isAdmin && onOpenRegister && (
        <button
          onClick={onOpenRegister}
          className="px-4 py-2 rounded-lg bg-azulMedio text-white text-sm font-medium hover:brightness-95 transition-colors shadow-sm"
        >
          Registrar usuario
        </button>
      )}
      {user?.platformRole && (
        <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 border border-blue-200">
          {user.platformRole}
        </span>
      )}
    </div>
  );

  const renderUserMenu = () => (
    <div className="relative">
      <button
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-gray-100 transition-colors group"
        title={user?.fullName || user?.email || 'Usuario'}
      >
        <div className="hidden sm:flex flex-col items-end">
          <div className="text-sm font-medium text-gray-800">
            {user?.fullName || 'Usuario'}
          </div>
          {user?.email && (
            <div className="text-xs text-gray-500">{user.email}</div>
          )}
        </div>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-azulMedio to-azulOscuro text-white font-semibold flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
          {userInitial}
        </div>
      </button>

      {isMenuOpen && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" onClick={closeMenu} aria-label="Cerrar menú" />
          <div className="absolute right-0 mt-2 w-64 bg-white shadow-xl rounded-xl border border-gray-200 z-20 overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
              <div className="font-semibold text-gray-900">{user?.fullName || 'Usuario'}</div>
              <div className="text-sm text-gray-600 mt-1">{user?.email || '—'}</div>
              {isAdmin && (
                <div className="inline-flex mt-2 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                  Administrador
                </div>
              )}
            </div>

            <div className="p-2">
              {isAdmin && (
                <button
                  className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  onClick={() => handleNavigation('/admin/users')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                  Gestión de usuarios
                </button>
              )}

              {canSeeTrash && (
                <button
                  className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  onClick={() => handleNavigation('/trash')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Papelera de reciclaje
                </button>
              )}

              <hr className="my-2 border-gray-200" />

              <button
                className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                onClick={handleLogout}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="w-full max-w-7xl mx-auto flex items-center gap-4">
          {/* Izquierda: logo que navega al dashboard */}
          <Link to="/dashboard" className="shrink-0 flex items-center gap-2">
            <img src={logo} alt="MBQ" className="h-9 w-auto" />
            <span className="sr-only">Ir al Dashboard</span>
          </Link>

          {/* Centro: buscador */}
          {renderSearchBox()}

          {/* Derecha: acciones admin + menú usuario */}
          <div className="flex items-center gap-4">
            {renderAdminZone()}
            {renderUserMenu()}
          </div>
        </div>
      </div>
    </header>
  );
}