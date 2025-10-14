// apps/frontend/src/components/grid/OptionEditor.tsx
import { useEffect, useRef, useState } from 'react';

export default function OptionEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // helper: mueve un elemento de posición
  function move<T>(arr: T[], from: number, to: number) {
    if (from === to) return arr;
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  }

  function update(i: number, v: string) {
    const next = options.slice();
    next[i] = v;
    onChange(next);
  }

  function add(afterIndex?: number) {
    const idx = typeof afterIndex === 'number' ? afterIndex + 1 : options.length;
    const base = `Opción ${options.length + 1}`;
    const next = options.slice();
    next.splice(idx, 0, base);
    onChange(next);
    // enfoca el nuevo input
    requestAnimationFrame(() => {
      inputRefs.current[idx]?.focus();
      inputRefs.current[idx]?.select();
    });
  }

  function remove(i: number) {
    const next = options.slice();
    next.splice(i, 1);
    onChange(next.length ? next : ['Opción 1']);
  }

  // pegado masivo: separa por saltos de línea o comas
  function handlePaste(i: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    if (!text.includes('\n') && !text.includes(',')) return; // pegar simple, dejar pasar
    e.preventDefault();
    const chunks = text
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!chunks.length) return;
    const next = options.slice();
    // reemplaza el valor actual por el primer chunk e inserta el resto
    next[i] = chunks[0];
    if (chunks.length > 1) next.splice(i + 1, 0, ...chunks.slice(1));
    onChange(next);

    requestAnimationFrame(() => {
      const focusIdx = Math.min(i + chunks.length - 1, next.length - 1);
      inputRefs.current[focusIdx]?.focus();
      inputRefs.current[focusIdx]?.select();
    });
  }

  // DnD
  function onDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIdx !== idx) setOverIdx(idx);
  }
  function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx == null) return;
    const next = move(options, dragIdx, idx);
    onChange(next);
    setDragIdx(null);
    setOverIdx(null);
  }
  function onDragEnd() {
    setDragIdx(null);
    setOverIdx(null);
  }

  // validar duplicados / vacíos (suave, solo estilo)
  const lower = options.map((o) => o.trim().toLowerCase());
  const dupIdx = new Set<number>();
  lower.forEach((v, i) => {
    if (!v) return;
    const first = lower.indexOf(v);
    if (first !== i) dupIdx.add(i);
  });

  useEffect(() => {
    // asegura que el array de refs cubra todos los inputs
    inputRefs.current.length = options.length;
  }, [options.length]);

  return (
    <div className="mt-2">
      <div className="grid gap-2">
        {options.map((opt, i) => {
          const isOver = overIdx === i;
          const isDragging = dragIdx === i;
          const isEmpty = opt.trim() === '';
          const isDup = dupIdx.has(i);

          return (
            <div
              key={i}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={(e) => onDrop(e, i)}
              className={[
                'flex items-center gap-2 rounded-md px-2 py-1 border',
                isOver ? 'bg-slate-50 border-cyan-300' : 'border-transparent',
                isDragging ? 'opacity-60' : 'opacity-100',
              ].join(' ')}
            >
              {/* handle de arrastre */}
              <button
                className="icon-btn cursor-move"
                aria-label="Reordenar"
                title="Arrastra para reordenar"
                draggable
                onDragStart={(e) => onDragStart(e, i)}
                onDragEnd={onDragEnd}
              >
                ⋮⋮
              </button>

              <input
                ref={(el) => (inputRefs.current[i] = el)}
                className={[
                  'input flex-1',
                  (isEmpty || isDup) ? 'ring-1 ring-amber-300' : '',
                ].join(' ')}
                value={opt}
                placeholder={`Opción ${i + 1}`}
                onChange={(e) => update(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add(i);
                  if (e.key === 'Backspace' && opt === '' && options.length > 1) {
                    e.preventDefault();
                    remove(i);
                    requestAnimationFrame(() => {
                      const focusIdx = Math.max(0, i - 1);
                      inputRefs.current[focusIdx]?.focus();
                    });
                  }
                }}
                onPaste={(e) => handlePaste(i, e)}
              />

              <button
                className="btn"
                onClick={() => add(i)}
                title="Insertar debajo"
                aria-label="Insertar opción debajo"
              >
                +
              </button>

              <button
                className="btn"
                onClick={() => remove(i)}
                title="Eliminar"
                aria-label="Eliminar opción"
                disabled={options.length === 1}
              >
                −
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="muted text-xs">
          Puedes <strong>pegar</strong> una lista (por comas o líneas) para crear varias opciones.
          {dupIdx.size > 0 && <span className="text-amber-600 ml-1">Hay nombres duplicados.</span>}
        </div>
        <button className="btn" onClick={() => add()}>
          Agregar opción
        </button>
      </div>
    </div>
  );
}