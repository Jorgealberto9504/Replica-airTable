import type { FieldType } from '../../api/fields';

const FIELD_TYPES: FieldType[] = [
  'TEXT','LONG_TEXT','NUMBER','CURRENCY','CHECKBOX','DATE','DATETIME','TIME','SINGLE_SELECT','MULTI_SELECT',
];

export default function FieldDefForm({
  name, type, onName, onType
}: {
  name: string;
  type: FieldType;
  onName: (v: string) => void;
  onType: (v: FieldType) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="field">
        <label className="label">Nombre</label>
        <input className="input" value={name} onChange={(e) => onName(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">Tipo</label>
        <select className="select" value={type} onChange={(e) => onType(e.target.value as FieldType)}>
          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}