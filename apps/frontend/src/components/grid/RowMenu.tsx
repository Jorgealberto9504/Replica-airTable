// apps/frontend/src/components/grid/RowMenu.tsx
import { forwardRef } from 'react';

type Props = {
  x: number;
  y: number;
  canDelete: boolean;
  onClose: () => void;
  onOpenComments: () => void;
  onDelete: () => void;
};

const RowMenu = forwardRef<HTMLDivElement, Props>(function RowMenu(
  { x, y, canDelete, onClose, onOpenComments, onDelete },
  ref
) {
  return (
    <>
      <div className="context-overlay" onClick={onClose} />
      <div
        ref={ref}
        className="context-panel"
        style={{ position: 'fixed', left: x, top: y, minWidth: 220 }}
      >
        <div className="menu-item" onClick={() => { onOpenComments(); }}>
          Comentarios
        </div>

        {canDelete && (
          <div className="menu-item-danger" onClick={() => { onDelete(); }}>
            Eliminar fila
          </div>
        )}
      </div>
    </>
  );
});

export default RowMenu;