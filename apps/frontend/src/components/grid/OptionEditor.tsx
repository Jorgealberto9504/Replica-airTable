export default function OptionEditor({
  options, onChange,
}: { options: string[]; onChange: (opts: string[]) => void }) {

  function update(i: number, v: string) {
    const next = options.slice();
    next[i] = v;
    onChange(next);
  }

  function add() {
    onChange([...(options), `Opción ${options.length + 1}`]);
  }

  function remove(i: number) {
    const next = options.slice();
    next.splice(i, 1);
    onChange(next.length ? next : ['Opción 1']);
  }

  return (
    <div className="mt-2">
      <div className="grid gap-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="input"
              value={opt}
              onChange={(e) => update(i, e.target.value)}
              placeholder={`Opción ${i + 1}`}
            />
            <button className="btn" onClick={() => remove(i)} title="Eliminar">–</button>
          </div>
        ))}
      </div>
      <div className="mt-2">
        <button className="btn" onClick={add}>Agregar opción</button>
      </div>
    </div>
  );
}