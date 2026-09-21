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
            label={shapeFill ? 'Filled shape' : 'Outline shape'}
            active={shapeFill}
            onClick={() => setShapeFill(!shapeFill)}
          >
            <span className="fill-icon" data-filled={shapeFill} />
          </Button>
        </>
      )}
    </nav>
  );
}
