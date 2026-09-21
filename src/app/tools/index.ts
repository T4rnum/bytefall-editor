import {
  createEllipseTool,
  createEyedropperTool,
  createFillTool,
  createLineTool,
  createRectTool,
  createStrokeTool,
} from './drawingTools';
import { createObjectTool } from './objectTool';
import { createSelectTool } from './selectTool';
import { createTextTool } from './textTool';
import type { Tool, ToolId } from './types';

export type { PointerInfo, Tool, ToolEnv, ToolId } from './types';
export { pickAt } from './drawingTools';

/** Порядок задаёт порядок кнопок на панели инструментов. */
export const TOOLS: readonly Tool[] = [
  createStrokeTool('pencil', 'Pencil', 'p'),
  createStrokeTool('eraser', 'Eraser', 'e'),
  createLineTool(),
  createRectTool(),
  createEllipseTool(),
  createFillTool(),
  createEyedropperTool(),
  createSelectTool(),
  createTextTool(),
  createObjectTool(),
];

const byId = new Map<ToolId, Tool>(TOOLS.map((t) => [t.id, t]));

export function getTool(id: ToolId): Tool {
  const tool = byId.get(id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

export function toolByHotkey(key: string): Tool | undefined {
  return TOOLS.find((t) => t.hotkey === key);
}
