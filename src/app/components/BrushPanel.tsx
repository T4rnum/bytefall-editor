import { ArrowLeftRight } from 'lucide-react';
import { type Brush, type BrushSlot, useEditorStore } from '../store/editorStore';
import { Button, Panel, TIP_ATTR } from '../ui';

/** Подпись слота: она же показывается в заголовках панелей символа и цвета. */
export const SLOT_LABELS: Readonly<Record<BrushSlot, string>> = { 0: 'LMB', 1: 'RMB' };

const SLOTS: readonly BrushSlot[] = [0, 1];

/** Кисть без символа и без фона ничего не рисует, поэтому она же работает ластиком. */
const isEraser = (brush: Brush): boolean => brush.glyph === '' && brush.bg === null;

function describe(brush: Brush): string {
  if (isEraser(brush)) return 'стирает';
  return brush.glyph === '' ? 'только фон' : `символ ${brush.glyph}`;
}

/** Как кисть выглядит на холсте: символ своим цветом на своём фоне. */
function BrushPreview({ brush }: { readonly brush: Brush }) {
  return (
    <span
      className={`brush-preview${brush.bg === null ? ' swatch--none' : ''}`}
      style={brush.bg === null ? undefined : { background: brush.bg }}
      aria-hidden="true"
    >
      <span style={{ color: brush.fg }}>{brush.glyph}</span>
    </span>
  );
}

/**
 * Две кисти, по одной на кнопку мыши: у каждой свой символ и свои цвета. Панели `Glyph` и
 * `Colors` правят выбранную здесь, поэтому они и показывают её подпись у заголовка.
 */
export function BrushPanel() {
  const brushes = useEditorStore((s) => s.brushes);
  const active = useEditorStore((s) => s.activeBrush);
  const setActiveBrush = useEditorStore((s) => s.setActiveBrush);
  const swapBrushes = useEditorStore((s) => s.swapBrushes);

  return (
    <Panel
      id="brush"
      title="Brush"
      actions={
        <Button
          icon
          size="sm"
          label="Поменять кисти местами"
          hotkey="Shift+X"
          onClick={swapBrushes}
        >
          <ArrowLeftRight size={14} />
        </Button>
      }
    >
      <div className="brush-slots" role="radiogroup" aria-label="Brush slots">
        {SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            role="radio"
            aria-checked={slot === active}
            className={`brush-slot${slot === active ? ' is-active' : ''}`}
            onClick={() => setActiveBrush(slot)}
            {...{
              [TIP_ATTR]: `${slot === 0 ? 'Левая' : 'Правая'} кнопка: ${describe(brushes[slot])}`,
            }}
          >
            <BrushPreview brush={brushes[slot]} />
            <span className="brush-slot-name">{SLOT_LABELS[slot]}</span>
          </button>
        ))}
      </div>
      <p className="brush-hint">
        Рисуют обе кнопки мыши. Пустая кисть без фона стирает — такой правая и заведена.
      </p>
    </Panel>
  );
}
