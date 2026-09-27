import type { Cell } from '../../core/cell';
import type { Document, Layer, ResizeAnchor } from '../../core/document';
import type { Point, Rect } from '../../core/geometry';
import type { PlacedGlyph } from '../../core/glyphPick';
import type { CellEdits, CellGrid, CellKey } from '../../core/grid';
import type { SceneObject } from '../../core/object';
import type { EditArea } from '../../core/objectEdit';
import type { Camera3D, Scene3D } from '../../core/scene3d/types';
import type { Selection } from '../../core/selection';

export type ToolId =
  | 'pencil'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'fill'
  | 'eyedropper'
  | 'select'
  | 'lasso'
  | 'wand'
  | 'text'
  | 'object'
  | 'bone'
  | 'canvas'
  | 'orbit';

/**
 * Сетка, в которой рисуют: активный слой в размер холста или, в правке изнутри, область правки
 * объекта. Ячейки — от (0, 0) до (width, height), не включая.
 */
export interface DrawTarget {
  readonly cells: CellGrid;
  readonly width: number;
  readonly height: number;
}

/** Правка объекта изнутри (Tab): его символы, их выделение и перенос по его сетке. */
export interface EditSession {
  readonly object: SceneObject;
  readonly area: EditArea;
  /** Символы объекта там, где их видно в момент сцены. Считаются при первом обращении. */
  placed(): readonly PlacedGlyph[];
  /** Выделенные символы — ключи ячеек объекта. */
  readonly glyphs: readonly CellKey[];
  setGlyphs(keys: readonly CellKey[]): void;
  /** Рамка или путь лассо, пока их тянут: замкнутый контур в документе. */
  setMarquee(loop: readonly Point[] | null): void;
  /** Ячейка области правки под точкой документа. */
  cellAt(point: Point): Point | null;
  /** Перенос выделенных символов на (dx, dy) ячеек объекта: черновиком и коммитом. */
  previewMove(dx: number, dy: number): void;
  commitMove(dx: number, dy: number): void;
}

/** Всё, что инструменту нужно от редактора. Собирается заново на каждое событие. */
export interface ToolEnv {
  readonly doc: Document;
  /** Активный слой, если его можно редактировать, иначе null. В правке изнутри — слой объекта. */
  readonly layer: Layer | null;
  /** 3D-сцена активного слоя, если он 3D и его можно править: её крутит «Орбита». */
  readonly scene3d: { readonly layerId: string; readonly scene: Scene3D } | null;
  readonly target: DrawTarget;
  /** Правка объекта изнутри или null, если её нет. */
  readonly editing: EditSession | null;
  /** Активная кисть: та, что показана в панелях символа и цвета. */
  readonly brush: Cell;
  /**
   * Кисть под кнопку мыши: левая берёт первую, правая — вторую. `null` значит «стирать»:
   * кисть без символа и без фона ничего не рисует, поэтому она же и ластик.
   */
  readonly brushFor: (button: number) => Cell | null;
  readonly shapeFill: boolean;
  /** Смежный режим волшебной палочки: только связная область, а не все похожие ячейки слоя. */
  readonly wandContiguous: boolean;
  readonly selection: Selection | null;
  readonly textCursor: Point | null;
  /** Главный выбранный объект: у него ручки трансформа. */
  readonly selectedObjectId: string | null;
  /** Все выбранные объекты, главный — последний. */
  readonly selectedObjectIds: readonly string[];
  /** Пикселей экрана на высоту ячейки: ручки гизмо хватаются в пикселях, а не в ячейках. */
  readonly zoom: number;
  /** Ширина ячейки к высоте: по X в ячейке `zoom * aspect` пикселей экрана. */
  readonly aspect: number;
  setPreview: (edits: CellEdits | null) => void;
  commit: (edits: CellEdits, label: string) => void;
  setSelection: (selection: Selection | null) => void;
  /** Результат пипетки. Кнопка выбирает кисть, как и при рисовании. */
  pick: (cell: Cell, button?: number) => void;
  setTextCursor: (cell: Point | null) => void;
  setSelectedObject: (id: string | null) => void;
  /** Выбирает несколько объектов, главный — последний. */
  setSelectedObjects: (ids: readonly string[]) => void;
  /** Черновик документа для превью структурных операций, например переноса объекта. */
  setDraft: (doc: Document | null) => void;
  /** Структурный коммит целого документа одной записью истории. */
  commitDocument: (label: string, next: Document) => void;
  /** Рамка будущего холста, пока тянут его край; null — рамки нет. */
  setCanvasFrame: (rect: Rect | null) => void;
  /** Новый размер холста во всех кадрах, содержимое прижато к якорю. */
  resizeCanvas: (width: number, height: number, anchor: ResizeAnchor) => void;
  /**
   * Камера 3D-сцены слоя: положение, цель и высота кадра одной записью; у анимированных — ключ в
   * текущий момент. Записи одного жеста склеиваются `mergeKey`.
   */
  setCamera3D: (layerId: string, camera: Camera3D, mergeKey: string) => void;
  /** Выбрать тело 3D-сцены активного слоя; null — снять выбор. */
  selectBody3D: (id: string | null) => void;
}

export interface PointerInfo {
  readonly cell: Point;
  /** Та же точка дробно, в ячейках документа: для жестов, которым мало целой ячейки. */
  readonly point: Point;
  /** 0 левая, 1 средняя, 2 правая. */
  readonly button: number;
  readonly shift: boolean;
  readonly alt: boolean;
  /** Ctrl, а на Mac — Cmd. */
  readonly ctrl?: boolean;
}

export interface Tool {
  readonly id: ToolId;
  readonly label: string;
  readonly hotkey: string;
  readonly cursor: string;
  /**
   * Инструмент сам распоряжается Alt, поэтому быстрая пипетка по Alt на него не действует.
   * У выделений Alt вычитает из набора, и это важнее, чем запасной способ взять цвет.
   */
  readonly ownsAlt?: boolean;
  /**
   * Правки инструмента не обрезаются выделением. Так помечены сами инструменты выделения:
   * они не рисуют, а переносят ячейки, и перенос как раз уводит их за пределы прежней маски.
   */
  readonly ignoresSelection?: boolean;
  /**
   * Инструмент рисует ячейки. В правке изнутри он получает ячейку сетки объекта, а не холста, и
   * рисует в ней, как бы объект ни был повёрнут.
   */
  readonly drawsCells?: boolean;
  onPointerDown?: (env: ToolEnv, info: PointerInfo) => void;
  onPointerMove?: (env: ToolEnv, info: PointerInfo) => void;
  onPointerUp?: (env: ToolEnv, info: PointerInfo) => void;
  /** Курсор над точкой без нажатой кнопки: подсказывает, что под указателем можно схватить. */
  hoverCursor?: (env: ToolEnv, info: PointerInfo) => string | null;
  /** true, если событие обработано и глобальные хоткеи запускать не нужно. */
  onKeyDown?: (env: ToolEnv, event: KeyboardEvent) => boolean;
  cancel?: (env: ToolEnv) => void;
}
