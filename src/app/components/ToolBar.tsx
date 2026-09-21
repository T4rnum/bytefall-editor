import {
  Circle,
  Eraser,
  type LucideIcon,
  Minus,
  Move,
  PaintBucket,
  Pencil,
  Pipette,
  Square,
  SquareDashed,
  Type,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { TOOLS, type ToolId } from '../tools';

const ICONS: Record<ToolId, LucideIcon> = {
  pencil: Pencil,
  eraser: Eraser,
  line: Minus,
  rect: Square,
  ellipse: Circle,
  fill: PaintBucket,
  eyedropper: Pipette,
  select: SquareDashed,
  text: Type,
  object: Move,
};

export function ToolBar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const shapeFill = useEditorStore((s) => s.shapeFill);
  const setShapeFill = useEditorStore((s) => s.setShapeFill);
  const showsFill = tool === 'rect' || tool === 'ellipse';

  return (
    <nav className="toolbar" aria-label="Tools">
      {TOOLS.map((t) => {
        const Icon = ICONS[t.id];
        return (
          <button
            key={t.id}
            type="button"
            className={`tool-btn${tool === t.id ? ' is-active' : ''}`}
            title={`${t.label} (${t.hotkey.toUpperCase()})`}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
          >
            <Icon size={18} />
          </button>
        );
      })}
      {showsFill && (
        <button
          type="button"
          className={`tool-btn tool-btn--option${shapeFill ? ' is-active' : ''}`}
          title={shapeFill ? 'Filled shape' : 'Outline shape'}
          aria-pressed={shapeFill}
          onClick={() => setShapeFill(!shapeFill)}
        >
          <span className="fill-icon" data-filled={shapeFill} />
        </button>
      )}
    </nav>
  );
}
