import { findObject } from '../../core/object';
import {
  extractGlyphsAction,
  joinSelectionToObjectAction,
  recolorSelectionAction,
} from '../store/cellTransferActions';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { toggleEditModeAction } from '../store/objectEditActions';
import { Button, plural } from '../ui';

const GLYPHS = { one: 'символ', few: 'символа', many: 'символов' } as const;

/**
 * Что можно сделать с объектом прямо сейчас, под списком объектов. В правке изнутри — с его
 * выделенными символами, а вне её при выделенных ячейках слоя — добавить их в объект.
 */
export function ObjectEditBar() {
  const doc = useDocumentStore((s) => s.doc);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const editing = useEditorStore((s) => s.editingObjectId !== null);
  const glyphs = useEditorStore((s) => s.glyphSelection.length);
  const hasCells = useEditorStore((s) => s.selection !== null);
  const selected = selectedId ? findObject(doc, selectedId) : undefined;
  if (!selected || selected.rig) return null;

  if (editing) {
    return (
      <div className="edit-bar">
        <p className="panel-hint">
          Правка изнутри: инструменты рисуют в сетке объекта, рамка, лассо и палочка выделяют его
          символы.
          {glyphs > 0 && ` Выделено: ${plural(glyphs, GLYPHS)}.`}
        </p>
        <div className="edit-bar-actions">
          <Button
            size="sm"
            disabled={glyphs === 0}
            label="Цвета активной кисти — выделенным символам"
            hotkey="Alt+Backspace"
            onClick={recolorSelectionAction}
          >
            Перекрасить
          </Button>
          <Button
            size="sm"
            disabled={glyphs === 0}
            label="Выделенные символы — в слой объекта, туда, где их видно"
            hotkey="Ctrl+Shift+J"
            onClick={extractGlyphsAction}
          >
            В слой
          </Button>
          <Button
            size="sm"
            variant="primary"
            label="Выйти из правки"
            hotkey="Tab"
            onClick={toggleEditModeAction}
          >
            Готово
          </Button>
        </div>
      </div>
    );
  }
  if (!hasCells) return null;
  return (
    <div className="edit-bar">
      <Button
        size="sm"
        label="Выделенные ячейки слоя уходят в объект, в клетки его сетки"
        hotkey="Ctrl+J"
        onClick={joinSelectionToObjectAction}
      >
        Добавить выделенное в «{selected.name}»
      </Button>
    </div>
  );
}
