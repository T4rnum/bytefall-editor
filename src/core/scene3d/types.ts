import { DEFAULT_QUANTIZE, type QuantizeOptions, type RgbaImage } from '../quantize';

/**
 * Псевдо-3D, режим A (DESIGN.md, раздел 6): сцена на слое рендерится в буфер «несколько пикселей
 * на ячейку», и квантайзер превращает его в ячейки слоя. В документе лежит только описание
 * сцены — примитивы, модели, камера, свет — и настройки квантизации; GPU-объектов нет.
 *
 * Оси как в Three.js: Y вверх, камера по умолчанию смотрит вдоль −Z. Углы — градусы.
 */
export type Vec3 = readonly [number, number, number];

export type Primitive3D = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
export type Node3DKind = Primitive3D | 'mesh';

export const PRIMITIVES_3D: readonly Primitive3D[] = [
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
];

/** Тело сцены: примитив единичного размера или модель, растянутые трансформом. */
export interface Node3D {
  readonly id: string;
  readonly name: string;
  readonly kind: Node3DKind;
  /** Модель узла `mesh`: идентификатор в `Document.meshes`; у примитива — null. */
  readonly mesh: string | null;
  readonly visible: boolean;
  readonly position: Vec3;
  /** Повороты вокруг X, Y, Z по порядку, градусы. */
  readonly rotation: Vec3;
  readonly scale: Vec3;
  /** Цвет поверхности; у модели умножается на её собственные цвета. */
  readonly color: string;
}

export interface Camera3D {
  readonly projection: 'perspective' | 'orthographic';
  readonly position: Vec3;
  /** Точка, на которую камера смотрит. */
  readonly target: Vec3;
  /** Угол обзора по вертикали у перспективной камеры, градусы. */
  readonly fov: number;
  /** Высота кадра в единицах сцены у ортографической камеры. */
  readonly size: number;
}

/** Рассеянный свет со всех сторон и «солнце» — параллельный свет из направления. */
export interface Light3D {
  readonly ambientColor: string;
  readonly ambient: number;
  readonly sunColor: string;
  readonly sun: number;
  /** Откуда светит солнце: азимут вокруг оси Y от +Z к +X и высота над горизонтом, градусы. */
  readonly sunAzimuth: number;
  readonly sunElevation: number;
}

/**
 * Как сцена становится символами (DESIGN.md, раздел 6). `raster` — режим A: рендер через
 * квантайзер. `grid` и `cloud` — режим B: символы стоят на поверхности тел, свет считается на
 * каждый; по сетке экрана или облаком, где у символа своё место и размер.
 */
export type Render3DMode = 'raster' | 'grid' | 'cloud';

export const RENDER_3D_MODES: readonly Render3DMode[] = ['raster', 'grid', 'cloud'];

export interface Render3D {
  readonly mode: Render3DMode;
  /**
   * Шаг символов облака в ячейках. С размером по глубине — на расстоянии от камеры до цели:
   * ближе символы крупнее и реже, дальше — мельче и гуще.
   */
  readonly spacing: number;
  readonly sizeByDepth: boolean;
  /** 0..1: туман разрежает дальнее по рампе, а не темнит цвет. Во всех режимах. */
  readonly fog: number;
}

export interface Scene3D {
  readonly nodes: readonly Node3D[];
  readonly camera: Camera3D;
  readonly light: Light3D;
  /** Как рендер становится ячейками: те же настройки, что у импорта картинки. */
  readonly quantize: QuantizeOptions;
  readonly render: Render3D;
}

/**
 * Часть модели: треугольники с нормалями, по желанию с цветами вершин и текстурой. Массивы
 * принадлежат документу и не меняются: новая модель — новые массивы.
 */
export interface MeshPart3D {
  /** x, y, z на вершину. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** u, v на вершину; null — без текстуры. */
  readonly uvs: Float32Array | null;
  /** r, g, b долями на вершину; null — цвет части. */
  readonly colors: Float32Array | null;
  /** Три вершины на треугольник. */
  readonly indices: Uint32Array;
  readonly color: string;
  readonly texture: RgbaImage | null;
}

/** Модель из glTF или рельеф из картинки: запечена в координаты модели, только на чтение. */
export interface Mesh3D {
  readonly id: string;
  readonly name: string;
  readonly parts: readonly MeshPart3D[];
}

/** Пределы, общие для документа, ключей и файла. */
export const MAX_NODES_3D = 64;
export const MAX_MESHES = 32;
export const MAX_MESH_PARTS = 64;
export const MAX_MESH_VERTICES = 262144;
export const MAX_TEXTURE_SIZE = 256;
export const MAX_COORD_3D = 1000;
export const MAX_ROTATION_3D = 36000;
export const MIN_SCALE_3D = 0.001;
export const MAX_SCALE_3D = 1000;
export const MIN_FOV = 1;
export const MAX_FOV = 170;
export const MAX_LIGHT = 10;
export const MIN_SPACING_3D = 0.5;
export const MAX_SPACING_3D = 8;

export const DEFAULT_CAMERA: Camera3D = {
  projection: 'perspective',
  position: [0, 1.5, 5],
  target: [0, 0, 0],
  fov: 40,
  size: 4,
};

export const DEFAULT_LIGHT: Light3D = {
  ambientColor: '#ffffff',
  ambient: 0.3,
  sunColor: '#ffffff',
  sun: 0.9,
  sunAzimuth: 35,
  sunElevation: 45,
};

export const DEFAULT_RENDER_3D: Render3D = {
  mode: 'raster',
  spacing: 1,
  sizeByDepth: true,
  fog: 0,
};

/** Квантизация 3D: контуры включены — без них модель выглядит шумом (DESIGN.md, раздел 5). */
export const DEFAULT_QUANTIZE_3D: QuantizeOptions = {
  ...DEFAULT_QUANTIZE,
  dither: 'none',
  edges: true,
};
