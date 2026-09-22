import { type Cell, makeCell } from '../../../core/cell';
import type { Document, Layer } from '../../../core/document';
import type { Point } from '../../../core/geometry';
import type { CellEdits } from '../../../core/grid';
import type { Selection } from '../../../core/selection';
import type { ToolEnv } from '../types';

/** Всё, что инструмент сделал через окружение. Проверять поведение удобнее, чем стор. */
export interface ToolCalls {
  readonly previews: (CellEdits | null)[];
  readonly commits: { label: string; edits: CellEdits }[];
  readonly docCommits: { label: string; doc: Document }[];
  readonly picks: { cell: Cell; button: number }[];
  readonly selections: (Selection | null)[];
  readonly selected: (string | null)[];
  readonly textCursors: (Point | null)[];
  draft: Document | null;
}

export interface TestEnvOptions {
  /** Активный слой. `null` означает, что слой скрыт или заперт и рисовать нельзя. */
  readonly layer?: Layer | null;
  /** Кисти левой и правой кнопки; `null` — ластик, как и в приложении. */
  readonly brushes?: readonly [Cell | null, Cell | null];
  readonly shapeFill?: boolean;
  readonly wandContiguous?: boolean;
  readonly selection?: Selection | null;
  readonly textCursor?: Point | null;
  readonly selectedObjectId?: string | null;
}

const DEFAULT_BRUSHES: readonly [Cell | null, Cell | null] = [makeCell('#'), null];

/**
 * Окружение инструмента без React, Zustand и браузера: `ToolEnv` для того и существует.
 * Возвращает и само окружение, и журнал вызовов.
 */
export function makeToolEnv(
  doc: Document,
  options: TestEnvOptions = {},
): { env: ToolEnv; calls: ToolCalls } {
  const {
    layer = doc.layers[0],
    brushes = DEFAULT_BRUSHES,
    shapeFill = false,
    wandContiguous = true,
    selection = null,
    textCursor = null,
    selectedObjectId = null,
  } = options;

  const calls: ToolCalls = {
    previews: [],
    commits: [],
    docCommits: [],
    picks: [],
    selections: [],
    selected: [],
    textCursors: [],
    draft: null,
  };

  const env: ToolEnv = {
    doc,
    layer,
    brush: brushes[0] ?? makeCell(''),
    brushFor: (button) => brushes[button === 2 ? 1 : 0],
    shapeFill,
    wandContiguous,
    selection,
    textCursor,
    selectedObjectId,
    setPreview: (edits) => calls.previews.push(edits),
    commit: (edits, label) => calls.commits.push({ label, edits }),
    setSelection: (rect) => calls.selections.push(rect),
    pick: (cell, button = 0) => calls.picks.push({ cell, button }),
    setTextCursor: (cell) => calls.textCursors.push(cell),
    setSelectedObject: (id) => calls.selected.push(id),
    setDraft: (draft) => {
      calls.draft = draft;
    },
    commitDocument: (label, next) => calls.docCommits.push({ label, doc: next }),
  };

  return { env, calls };
}

/** Последняя запись превью: именно её видит пользователь во время жеста. */
export const lastPreview = (calls: ToolCalls): CellEdits | null =>
  calls.previews.length > 0 ? calls.previews[calls.previews.length - 1] : null;

/** Указатель. По умолчанию — левая кнопка без модификаторов. */
export const at = (x: number, y: number, button = 0, shift = false, alt = false) => ({
  cell: { x, y },
  button,
  shift,
  alt,
});
