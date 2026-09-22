import { Plus, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from './Button';
import { TextField } from './TextField';

export interface PropertyRow {
  readonly key: string;
  /** Значение текстом. null — у выбранного оно разное, поле тогда пустое с подсказкой. */
  readonly value: string | null;
  /** Подсказка к имени свойства: тип значения, у скольких ячеек оно есть. */
  readonly hint?: string;
}

export interface PropertyRowAction {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick: (key: string) => void;
}

export interface PropertyEditorProps {
  readonly rows: readonly PropertyRow[];
  /** Новое значение текстом: разбирать его в число или «да/нет» — дело того, кто вызывает. */
  readonly onChange: (key: string, text: string) => void;
  readonly onRemove: (key: string) => void;
  readonly onAdd: (key: string, text: string) => void;
  /** Ещё одна кнопка у каждой строки, например «выделить все ячейки с этим свойством». */
  readonly rowAction?: PropertyRowAction;
  /** id поля имени нового свойства: на него переводит горячая клавиша. */
  readonly addKeyId?: string;
}

/** Подсказка к значению: какого оно типа. */
export function valueTypeName(value: string | number | boolean): string {
  if (typeof value === 'number') return 'число';
  if (typeof value === 'boolean') return 'да или нет';
  return 'строка';
}

/**
 * Список свойств «имя — значение» с правкой, удалением и добавлением. Один на объекты и ячейки:
 * у них одинаковые значения, и форма не должна вести себя по-разному в двух местах.
 */
export function PropertyEditor({
  rows,
  onChange,
  onRemove,
  onAdd,
  rowAction,
  addKeyId,
}: PropertyEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const add = (): void => {
    if (!newKey.trim()) return;
    onAdd(newKey.trim(), newValue);
    setNewKey('');
    setNewValue('');
  };

  const onEnter = (e: React.KeyboardEvent): void => {
    // Горячие клавиши редактора не должны срабатывать поверх ввода.
    e.stopPropagation();
    if (e.key === 'Enter') add();
  };

  return (
    <div className="props">
      {rows.map((row) => (
        <div className="prop-row" key={row.key}>
          <span className="prop-key" title={row.hint}>
            {row.key}
          </span>
          <TextField
            value={row.value ?? ''}
            placeholder={row.value === null ? 'разные' : undefined}
            size="sm"
            ariaLabel={`Значение ${row.key}`}
            onCommit={(text) => onChange(row.key, text)}
          />
          {rowAction && (
            <Button
              icon
              size="sm"
              label={rowAction.label}
              onClick={() => rowAction.onClick(row.key)}
            >
              {rowAction.icon}
            </Button>
          )}
          <Button
            icon
            size="sm"
            variant="danger"
            label="Удалить свойство"
            onClick={() => onRemove(row.key)}
          >
            <X size={12} />
          </Button>
        </div>
      ))}
      <div className="prop-row">
        <input
          id={addKeyId}
          className="textfield textfield--sm prop-key-input"
          placeholder="свойство"
          aria-label="Имя нового свойства"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={onEnter}
        />
        <input
          className="textfield textfield--sm"
          placeholder="значение"
          aria-label="Значение нового свойства"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={onEnter}
        />
        <Button icon size="sm" label="Добавить свойство" disabled={!newKey.trim()} onClick={add}>
          <Plus size={12} />
        </Button>
      </div>
    </div>
  );
}
