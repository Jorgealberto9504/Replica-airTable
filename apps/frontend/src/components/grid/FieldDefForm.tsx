// apps/frontend/src/components/grid/FieldDefForm.tsx
import { useId } from 'react';
import type { FieldType } from '../../api/fields';

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'TEXT',         label: 'Texto' },
  { value: 'LONG_TEXT',    label: 'Texto largo' },
  { value: 'NUMBER',       label: 'Número' },
  { value: 'CURRENCY',     label: 'Moneda' },
  { value: 'CHECKBOX',     label: 'Casilla (booleano)' },
  { value: 'DATE',         label: 'Fecha' },
  { value: 'DATETIME',     label: 'Fecha y hora' },
  { value: 'TIME',         label: 'Hora (minutos)' },
  { value: 'SINGLE_SELECT',label: 'Selección única' },
  { value: 'MULTI_SELECT', label: 'Selección múltiple' },
];

const TYPE_HINT: Record<FieldType, string> = {
  TEXT: 'Cadenas cortas. Ideal para títulos, códigos y etiquetas simples.',
  LONG_TEXT: 'Texto con varias líneas. Perfecto para descripciones.',
  NUMBER: 'Valores numéricos; admite enteros y decimales.',
  CURRENCY: 'Números con intención monetaria.',
  CHECKBOX: 'Verdadero/Falso.',
  DATE: 'Solo fecha (sin hora).',
  DATETIME: 'Fecha y hora en local.',
  TIME: 'Hora almacenada como minutos desde 00:00.',
  SINGLE_SELECT: 'Una sola opción. Podrás definir las opciones abajo.',
  MULTI_SELECT: 'Varias opciones. Podrás definir las opciones abajo.',
};

export default function FieldDefForm({
  name,
  type,
  onName,
  onType,
}: {
  name: string;
  type: FieldType;
  onName: (v: string) => void;
  onType: (v: FieldType) => void;
}) {
  const nameId = useId();
  const typeId = useId();
  const invalidName = name.trim() === '';

  return (
    <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
      {/* Nombre */}
      <div className="field">
        <label className="label" htmlFor={nameId}>Nombre</label>
        <input
          id={nameId}
          className="input"
          placeholder="Ej. Estado, Prioridad, Asignado a"
          value={name}
          onChange={(e) => onName(e.target.value)}
          onBlur={() => onName(name.trim())}
          aria-invalid={invalidName || undefined}
        />
        <div className="muted text-xs mt-1">
          Usa un nombre claro; podrás renombrarlo más tarde.
        </div>
      </div>

      {/* Tipo */}
      <div className="field">
        <label className="label" htmlFor={typeId}>Tipo</label>
        <select
          id={typeId}
          className="select"
          value={type}
          onChange={(e) => onType(e.target.value as FieldType)}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <div className="muted text-xs mt-1">
          {TYPE_HINT[type]}
        </div>
      </div>
    </form>
  );
}