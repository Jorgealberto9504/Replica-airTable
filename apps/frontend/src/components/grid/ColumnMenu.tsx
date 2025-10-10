// apps/frontend/src/components/grid/ColumnMenu.tsx
import { forwardRef } from 'react';
import type { Field } from '../../api/fields';

type Props = {
  field: Field;
  x: number;
  y: number;
  onClose: () => void;
  onRename: () => void;
  onChangeType: () => void;
  onDelete: () => void;
};

const ColumnMenu = forwardRef<HTMLDivElement, Props>(function ColumnMenu(
  { field, x, y, onClose, onRename, onChangeType, onDelete },
  ref
) {
  return (
    <>
      <div className="context-overlay" onClick={onClose} />
      <div
        ref={ref}
        className="context-panel"
        style={{ position: 'fixed', left: x, top: y }}
      >
        <div className="menu-item" onClick={() => { onRename(); onClose(); }}>
          Renombrar…
        </div>
        <div className="menu-item" onClick={() => { onChangeType(); onClose(); }}>
          Cambiar tipo…
        </div>
        <div className="menu-item-danger" onClick={() => { onDelete(); onClose(); }}>
          Enviar a papelera
        </div>
      </div>
    </>
  );
});

export default ColumnMenu;