import { create } from 'zustand';
import { DEFAULT_FG } from '../../core/cell';
import type { Preview } from '../../core/compositor';
import type { Document } from '../../core/document';
import type { Point } from '../../core/geometry';
import type { Clip, Selection } from '../../core/selection';
import { DEFAULT_POST, type PostSettings } from '../../render/post';
import type { CameraState } from '../../render/SceneView';
import type { ToolId } from '../tools/types';

/** Кисть одной кнопки мыши: символ и два цвета. */
export interface Brush {
  readonly glyph: string;
  readonly fg: string;
  readonly bg: string | null;
}

/** 0 — левая кнопка мыши, 1 — правая. */
export type BrushSlot = 0 | 1;

export interface EditorState {
  readonly tool: ToolId;
  /** Две кисти: по одной на кнопку мыши. Панели символа и цвета правят активную. */
  readonly brushes: readonly [Brush, Brush];
  readonly activeBrush: BrushSlot;
  /** Заливать ли фигуры (прямоугольник, эллипс). */
  readonly shapeFill: boolean;
  /** Волшебная палочка берёт только связную область, а не все похожие ячейки слоя. */
  readonly wandContiguous: boolean;
  readonly camera: CameraState;
  readonly showGrid: boolean;
  /** Шахматка под прозрачным холстом. Выключают, чтобы посмотреть рисунок на цвете рабочей области. */
  readonly showChecker: boolean;
  readonly workspaceColor: string;
  readonly cursorCell: Point | null;
  readonly selection: Selection | null;
  readonly clipboard: Clip | null;
  readonly preview: Preview | null;
  readonly textCursor: Point | null;
  readonly selectedObjectId: string | null;
  /** Черновик документа на время перетаскивания объекта: рендерится вместо основного. */
  readonly draft: Document | null;
  readonly isPlaying: boolean;
  /** Показывать соседние кадры полупрозрачно. */
  readonly onionSkin: boolean;
  /** Крутить ли часы эффектов в редакторе. */
  readonly effectsLive: boolean;
  /** Время эффектов в миллисекундах. */
  readonly effectTime: number;
  /** Постэффекты уровня пикселей: свечение и CRT. */
  readonly post: PostSettings;

  setTool: (tool: ToolId) => void;
  setActiveBrush: (slot: BrushSlot) => void;
  /** Меняет кисти местами: то, чем рисовала левая кнопка, переезжает на правую. */
  swapBrushes: () => void;
  setGlyph: (glyph: string) => void;
  setFg: (fg: string) => void;
  setBg: (bg: string | null) => void;
  swapColors: () => void;
  setShapeFill: (fill: boolean) => void;
  setWandContiguous: (contiguous: boolean) => void;
  setCamera: (camera: CameraState) => void;
  setShowGrid: (show: boolean) => void;
  setShowChecker: (show: boolean) => void;
  setCursorCell: (cell: Point | null) => void;
  setSelection: (selection: Selection | null) => void;
  setClipboard: (clip: Clip | null) => void;
  setPreview: (preview: Preview | null) => void;
  setTextCursor: (cell: Point | null) => void;
  setSelectedObject: (id: string | null) => void;
  setDraft: (doc: Document | null) => void;
  setPlaying: (playing: boolean) => void;
  setOnionSkin: (enabled: boolean) => void;
  setEffectsLive: (live: boolean) => void;
  setEffectTime: (time: number) => void;
  setPost: (patch: Partial<PostSettings>) => void;
}

const samePoint = (a: Point | null, b: Point | null): boolean =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);

/** Кисть, которую правят панели и которой рисует левая кнопка, если активна она. */
export const activeBrush = (s: EditorState): Brush => s.brushes[s.activeBrush];

/**
 * Кисть под кнопку мыши. Правая кнопка по умолчанию стирает: пустой символ без фона —
 * это и есть ластик, см. `isBlankCell`.
 */
export const brushOf = (s: EditorState, button: number): Brush => s.brushes[button === 2 ? 1 : 0];

/** Точечная правка активной кисти: остальные поля и вторая кисть остаются теми же. */
function patchActive(s: EditorState, patch: Partial<Brush>): Pick<EditorState, 'brushes'> {
  const next: Brush = { ...s.brushes[s.activeBrush], ...patch };
  return { brushes: s.activeBrush === 0 ? [next, s.brushes[1]] : [s.brushes[0], next] };
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'pencil',
  brushes: [
    { glyph: '#', fg: DEFAULT_FG, bg: null },
    { glyph: '', fg: DEFAULT_FG, bg: null },
  ],
  activeBrush: 0,
  shapeFill: false,
  wandContiguous: true,
  camera: { centerX: 0, centerY: 0, zoom: 16 },
  showGrid: true,
  showChecker: true,
  workspaceColor: '#111114',
  cursorCell: null,
  selection: null,
  clipboard: null,
  preview: null,
  textCursor: null,
  selectedObjectId: null,
  draft: null,
  isPlaying: false,
  onionSkin: false,
  effectsLive: true,
  effectTime: 0,
  post: DEFAULT_POST,

  setTool: (tool) => set({ tool, preview: null, textCursor: null, draft: null }),
  setActiveBrush: (activeBrush) => set({ activeBrush }),
  swapBrushes: () => set((s) => ({ brushes: [s.brushes[1], s.brushes[0]] })),
  setGlyph: (glyph) => set((s) => patchActive(s, { glyph })),
  setFg: (fg) => set((s) => patchActive(s, { fg })),
  setBg: (bg) => set((s) => patchActive(s, { bg })),
  swapColors: () =>
    set((s) => {
      const b = activeBrush(s);
      return patchActive(s, { fg: b.bg ?? b.fg, bg: b.bg === null ? null : b.fg });
    }),
  setShapeFill: (shapeFill) => set({ shapeFill }),
  setWandContiguous: (wandContiguous) => set({ wandContiguous }),
  setCamera: (camera) => set({ camera }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowChecker: (showChecker) => set({ showChecker }),
  setCursorCell: (cell) => set((s) => (samePoint(s.cursorCell, cell) ? s : { cursorCell: cell })),
  setSelection: (selection) => set({ selection }),
  setClipboard: (clipboard) => set({ clipboard }),
  setPreview: (preview) => set({ preview }),
  setTextCursor: (textCursor) => set({ textCursor }),
  setSelectedObject: (selectedObjectId) => set({ selectedObjectId }),
  setDraft: (draft) => set({ draft }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setOnionSkin: (onionSkin) => set({ onionSkin }),
  setEffectsLive: (effectsLive) => set({ effectsLive }),
  setEffectTime: (effectTime) => set({ effectTime }),
  setPost: (patch) => set((s) => ({ post: { ...s.post, ...patch } })),
}));
