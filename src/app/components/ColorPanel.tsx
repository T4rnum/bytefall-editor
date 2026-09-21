import { ArrowLeftRight, Ban, Plus } from 'lucide-react';
import { normalizeHex } from '../../core/color';
import {
  addPaletteColorAction,
  removePaletteColorAction,
  setBackgroundAction,
} from '../store/documentActions';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { Button, Field, Panel } from '../ui';

/** input[type=color] понимает только #rrggbb. */
const toInputColor = (hex: string): string => normalizeHex(hex).slice(0, 7);

export function ColorPanel() {
  const fg = useEditorStore((s) => s.fg);
  const bg = useEditorStore((s) => s.bg);
  const setFg = useEditorStore((s) => s.setFg);
  const setBg = useEditorStore((s) => s.setBg);
  const swapColors = useEditorStore((s) => s.swapColors);
  const palette = useDocumentStore((s) => s.doc.palette);
  const background = useDocumentStore((s) => s.doc.background);

  return (
    <Panel
      id="colors"
      title="Colors"
      actions={
        <Button icon size="sm" label="Swap colors" hotkey="X" onClick={swapColors}>
          <ArrowLeftRight size={14} />
        </Button>
      }
    >
      <div className="color-pair">
        <label
          className="swatch swatch--fg"
          title="Foreground: glyph color"
          style={{ background: fg }}
        >
          <input type="color" value={toInputColor(fg)} onChange={(e) => setFg(e.target.value)} />
        </label>
        <label
          className={`swatch swatch--bg${bg === null ? ' swatch--none' : ''}`}
          title="Background: cell color"
          style={bg === null ? undefined : { background: bg }}
        >
          <input
            type="color"
            value={toInputColor(bg ?? '#000000')}
            onChange={(e) => setBg(e.target.value)}
          />
        </label>
        <Button
          icon
          size="sm"
          label="No background"
          active={bg === null}
          onClick={() => setBg(null)}
        >
          <Ban size={14} />
        </Button>
      </div>

      <div className="palette" role="list" aria-label="Palette">
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

      <Field label="Canvas">
        <input
          type="color"
          className="color-inline"
          aria-label="Canvas background color"
          value={toInputColor(background ?? '#000000')}
          onChange={(e) => setBackgroundAction(e.target.value)}
        />
        <Button
          size="sm"
          active={background === null}
          onClick={() => setBackgroundAction(background === null ? '#000000' : null)}
        >
          {background === null ? 'transparent' : 'solid'}
        </Button>
      </Field>
    </Panel>
  );
}
