import type { Cell } from '../../core/cell';
import type { Document, Layer } from '../../core/document';
import type { Point, Rect } from '../../core/geometry';
import type { CellEdits } from '../../core/grid';

export type ToolId =
  | 'pencil'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'fill'
  | 'eyedropper'
  | 'select'
  | 'text'
  | 'object';

/** Всё, что инструменту нужно от редактора. Собирается заново на каждое событие. */
export interface ToolEnv {
  readonly doc: Document;
  /** Активный слой, если его можно редактировать, иначе null. */
  readonly layer: Layer | null;
  /** Текущая кисть: символ и цвета. */
  readonly brush: Cell;
  readonly shapeFill: boolean;
  readonly selection: Rect | null;
  readonly textCursor: Point | null;
  readonly selectedObjectId: string | null;
  setPreview: (edits: CellEdits | null) => void;
  commit: (edits: CellEdits, label: string) => void;
  setSelection: (rect: Rect | null) => void;
  /** Результат пипетки. */
  pick: (cell: Cell) => void;
  setTextCursor: (cell: Point | null) => void;
  setSelectedObject: (id: string | null) => void;
  /** Черновик документа для превью структурных операций, например переноса объекта. */
  setDraft: (doc: Document | null) => void;
  /** Структурный коммит целого документа одной записью истории. */
  commitDocument: (label: string, next: Document) => void;
}

export interface PointerInfo {
  readonly cell: Point;
  /** 0 левая, 1 средняя, 2 правая. */
  readonly button: number;
  readonly shift: boolean;
}

export interface Tool {
  readonly id: ToolId;
  readonly label: string;
  readonly hotkey: string;
  readonly cursor: string;
  onPointerDown?: (env: ToolEnv, info: PointerInfo) => void;
  onPointerMove?: (env: ToolEnv, info: PointerInfo) => void;
  onPointerUp?: (env: ToolEnv, info: PointerInfo) => void;
  /** true, если событие обработано и глобальные хоткеи запускать не нужно. */
  onKeyDown?: (env: ToolEnv, event: KeyboardEvent) => boolean;
  cancel?: (env: ToolEnv) => void;
}
