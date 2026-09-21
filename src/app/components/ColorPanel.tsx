import { ArrowLeftRight, Ban, Plus } from 'lucide-react';
import { normalizeHex } from '../../core/color';
import {
  addPaletteColorAction,
  removePaletteColorAction,
  setBackgroundAction,
} from '../store/documentActions';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';

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
    <section className="panel">
      <header className="panel-header">
        <span>Colors</span>
        <div className="panel-actions">
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Swap colors (X)"
            onClick={swapColors}
          >
            <ArrowLeftRight size={14} />
          </button>
        </div>
      </header>

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
        <button
          type="button"
          className={`icon-btn icon-btn--small${bg === null ? ' is-active' : ''}`}
          title="No background"
          onClick={() => setBg(null)}
        >
          <Ban size={14} />
        </button>
      </div>

      <div className="palette" role="list" aria-label="Palette">
        {palette.map((color) => (
          <button
            key={color}
            type="button"
            role="listitem"
            className={`palette-swatch${color === fg ? ' is-fg' : ''}${color === bg ? ' is-bg' : ''}`}
            style={{ background: color }}
            title={`${color}: left click sets glyph color, right click sets cell color, Shift+click removes`}
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
          title="Add current glyph color to palette"
          onClick={() => addPaletteColorAction(normalizeHex(fg))}
        >
          <Plus size={12} />
        </button>
      </div>

      <label className="inline-row">
        <span>Canvas</span>
        <input
          type="color"
          value={toInputColor(background ?? '#000000')}
          onChange={(e) => setBackgroundAction(e.target.value)}
        />
        <button
          type="button"
          className={`text-btn text-btn--small${background === null ? ' is-active' : ''}`}
          onClick={() => setBackgroundAction(background === null ? '#000000' : null)}
        >
          {background === null ? 'transparent' : 'solid'}
        </button>
      </label>
    </section>
  );
}
