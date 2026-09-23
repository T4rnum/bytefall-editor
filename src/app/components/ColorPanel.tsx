import { useRef } from 'react';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { normalizeHex } from '../../core/color';
import {
  addPaletteColorAction,
  removePaletteColorAction,
  setBackgroundAction,
} from '../store/documentActions';
import { useDocumentStore } from '../store/documentStore';
import { activeBrush, useEditorStore } from '../store/editorStore';
import { Button, ColorField, Field, Panel } from '../ui';
import { SLOT_LABELS } from './BrushPanel';

export function ColorPanel() {
  /**
   * Цвет холста — правка документа, и палитра шлёт её на каждое движение. Правки одного жеста
   * склеиваются общим ключом серии в одну запись истории, как у ползунка непрозрачности слоя.
   */
  const gesture = useRef(0);
  const fg = useEditorStore((s) => activeBrush(s).fg);
  const bg = useEditorStore((s) => activeBrush(s).bg);
  const setFg = useEditorStore((s) => s.setFg);
  const setBg = useEditorStore((s) => s.setBg);
  const swapColors = useEditorStore((s) => s.swapColors);
  const slot = useEditorStore((s) => s.activeBrush);
  const palette = useDocumentStore((s) => s.doc.palette);
  const background = useDocumentStore((s) => s.doc.background);

  return (
    <Panel
      id="colors"
      title="Цвета"
      badge={SLOT_LABELS[slot]}
      actions={
        <Button icon size="sm" label="Поменять цвета местами" hotkey="X" onClick={swapColors}>
          <ArrowLeftRight size={14} />
        </Button>
      }
    >
      <div className="color-pair">
        <ColorField
          value={fg}
          onChange={(next) => setFg(next ?? fg)}
          label="Цвет символа"
          eyedropper
          className="colorfield--fg"
        />
        <ColorField value={bg} onChange={setBg} label="Цвет фона ячейки" allowNone />
      </div>

      <div className="palette" role="list" aria-label="Палитра">
        {palette.map((color) => (
          <button
            key={color}
            type="button"
            role="listitem"
            className={`palette-swatch${color === fg ? ' is-fg' : ''}${color === bg ? ' is-bg' : ''}`}
            style={{ background: color }}
            title={`${color}: левая кнопка — цвет символа, правая — цвет фона, Shift+щелчок удаляет`}
            onClick={(e) => (e.shiftKey ? removePaletteColorAction(color) : setFg(color))}
            onContextMenu={(e) => {
              e.preventDefault();
              setBg(color);
            }}
          />
        ))}
        <button
          type="button"
          className="palette-swatch palette-swatch--add"
          title="Добавить текущий цвет символа в палитру"
          onClick={() => addPaletteColorAction(normalizeHex(fg))}
        >
          <Plus size={12} />
        </button>
      </div>

      <Field label="Холст">
        <ColorField
          value={background}
          onChange={(next) => setBackgroundAction(next, `canvas-background:${gesture.current}`)}
          onCommit={(next) => {
            setBackgroundAction(next, `canvas-background:${gesture.current}`);
            // Конец жеста: следующий выбор цвета станет отдельной отменой.
            gesture.current += 1;
          }}
          label="Цвет холста"
          allowNone
          size="sm"
        />
      </Field>
    </Panel>
  );
}
