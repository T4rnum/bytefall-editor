import {
  Circle,
  Eraser,
  Grid2x2,
  Lasso,
  type LucideIcon,
  Minus,
  Move,
  PaintBucket,
  Pencil,
  Pipette,
  Scan,
  Square,
  SquareDashed,
  Type,
  Wand,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { TOOLS, type ToolId } from '../tools';
import { Button } from '../ui';

const ICONS: Record<ToolId, LucideIcon> = {
  pencil: Pencil,
  eraser: Eraser,
  line: Minus,
  rect: Square,
  ellipse: Circle,
  fill: PaintBucket,
  eyedropper: Pipette,
  select: SquareDashed,
  lasso: Lasso,
  wand: Wand,
  text: Type,
  object: Move,
};

export function ToolBar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const shapeFill = useEditorStore((s) => s.shapeFill);
  const setShapeFill = useEditorStore((s) => s.setShapeFill);
  const wandContiguous = useEditorStore((s) => s.wandContiguous);
  const setWandContiguous = useEditorStore((s) => s.setWandContiguous);
  const showsFill = tool === 'rect' || tool === 'ellipse';

  return (
    <nav className="toolbar" aria-label="Инструменты">
      {TOOLS.map((t) => {
        const Icon = ICONS[t.id];
        return (
          <Button
            key={t.id}
            icon
            size="lg"
            label={t.label}
            hotkey={t.hotkey.toUpperCase()}
            active={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            <Icon size={18} />
          </Button>
        );
      })}
      {showsFill && (
        <>
          <span className="toolbar-separator" />
          <Button
            icon
            size="lg"
            label={shapeFill ? 'Фигура с заливкой' : 'Только контур'}
            active={shapeFill}
            onClick={() => setShapeFill(!shapeFill)}
          >
            <span className="fill-icon" data-filled={shapeFill} />
          </Button>
        </>
      )}
      {tool === 'wand' && (
        <>
          <span className="toolbar-separator" />
          <Button
            icon
            size="lg"
            label={wandContiguous ? 'Связная область' : 'Все похожие ячейки'}
            active={!wandContiguous}
            onClick={() => setWandContiguous(!wandContiguous)}
          >
            {wandContiguous ? <Scan size={18} /> : <Grid2x2 size={18} />}
          </Button>
        </>
      )}
    </nav>
  );
}
