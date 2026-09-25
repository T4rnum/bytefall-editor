import { z } from 'zod';
import { normalizeHex } from '../color';
import { hasMaterial } from '../material';
import { constraintsSchema } from './constraints';
import { deformersSchema } from './deformers';
import { materialFromFile, materialSchema, materialToFile } from './material';
import { rigFromFile, rigSchema, rigToFile } from './rig';
import type { Layer } from '../document';
import { type CellGrid, type CellKey, keyOf, xOf, yOf } from '../grid';
import type { SceneObject } from '../object';
import {
  type GlyphOverride,
  type GlyphOverrides,
  MAX_PIVOT,
  MAX_ROTATION,
  MAX_SCALE,
  MAX_SHIFT,
  MIN_SCALE,
  type Transform2D,
  centerPivot,
  createTransform,
  normalizeOverride,
} from '../transform';
import {
  DocumentFormatError,
  MAX_CELLS_PER_LAYER,
  MAX_NAME_LENGTH,
  attrs,
  cellSchema,
  cellsFromFile,
  cellsToFile,
  coordinate,
  hex,
  id,
  position,
} from './primitives';

const shift = z.number().min(-MAX_SHIFT).max(MAX_SHIFT);
const rotation = z.number().min(-MAX_ROTATION).max(MAX_ROTATION);
const scale = z.number().min(MIN_SCALE).max(MAX_SCALE);
const pivot = z.number().min(-MAX_PIVOT).max(MAX_PIVOT);

const transformSchema = z.object({
  x: position,
  y: position,
  dx: shift,
  dy: shift,
  rot: rotation,
  sx: scale,
  sy: scale,
  px: pivot,
  py: pivot,
});

/** Правка символа ссылается на ячейку объекта по её локальным координатам. */
const overrideSchema = z.object({
  x: coordinate,
  y: coordinate,
  dx: shift.optional(),
  dy: shift.optional(),
  rot: rotation.optional(),
  sx: scale.optional(),
  sy: scale.optional(),
});

export const objectSchema = z.object({
  id,
  name: z.string().max(MAX_NAME_LENGTH),
  layerId: id,
  /** Версия 5. */
  parentId: id.optional(),
  /** Версии 2–4: позиция без трансформа. */
  x: position.optional(),
  y: position.optional(),
  /** Версия 5. */
  transform: transformSchema.optional(),
  visible: z.boolean(),
  locked: z.boolean(),
  /** Версия 6: вид объекта целиком. */
  opacity: z.number().min(0).max(1).optional(),
  tint: hex.optional(),
  cells: z.array(cellSchema).max(MAX_CELLS_PER_LAYER),
  overrides: z.array(overrideSchema).max(MAX_CELLS_PER_LAYER).optional(),
  /** Версия 7. */
  deformers: deformersSchema.optional(),
  /** Версия 8. */
  material: materialSchema.optional(),
  /** Версия 9: кость или контроллер рига и связи объекта. */
  rig: rigSchema.optional(),
  constraints: constraintsSchema.optional(),
  props: attrs.optional(),
});

type ObjectFile = z.infer<typeof objectSchema>;
type OverrideFile = z.infer<typeof overrideSchema>;

function overridesToFile(overrides: GlyphOverrides): OverrideFile[] {
  return [...overrides.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, o]) => ({ x: xOf(key), y: yOf(key), ...o }));
}

export function objectsToFile(objects: readonly SceneObject[]): ObjectFile[] {
  // Ссылка на родителя, которого в кадре нет, сделала бы файл нечитаемым: такую не пишем. Так
  // объект и рисуется — пропавший родитель считается корнем.
  const ids = new Set(objects.map((o) => o.id));
  return objects.map((obj) => ({
    id: obj.id,
    name: obj.name,
    layerId: obj.layerId,
    ...(obj.parentId !== null && ids.has(obj.parentId) ? { parentId: obj.parentId } : {}),
    transform: { ...obj.transform },
    visible: obj.visible,
    locked: obj.locked,
    ...(obj.opacity !== 1 ? { opacity: obj.opacity } : {}),
    ...(obj.tint !== null ? { tint: obj.tint } : {}),
    cells: cellsToFile(obj.cells),
    ...(obj.overrides.size > 0 ? { overrides: overridesToFile(obj.overrides) } : {}),
    ...(obj.deformers.length > 0 ? { deformers: [...obj.deformers] } : {}),
    ...(hasMaterial(obj.material) ? { material: materialToFile(obj.material) } : {}),
    ...(obj.rig ? { rig: rigToFile(obj.rig) } : {}),
    ...(obj.constraints.length > 0 ? { constraints: [...obj.constraints] } : {}),
    ...(Object.keys(obj.props).length > 0 ? { props: obj.props } : {}),
  }));
}

/** До версии 5 у объекта была только позиция: трансформ без поворота, опора в центре. */
function transformFromFile(obj: ObjectFile, cells: CellGrid): Transform2D {
  if (obj.transform) return obj.transform;
  if (obj.x === undefined || obj.y === undefined) {
    throw new DocumentFormatError(`Object ${obj.id} has neither transform nor position`);
  }
  return createTransform(obj.x, obj.y, centerPivot(cells));
}

/** Правка ячейки, которой у объекта нет, и правка, ничего не меняющая, отбрасываются. */
function overridesFromFile(overrides: readonly OverrideFile[], cells: CellGrid): GlyphOverrides {
  const out = new Map<CellKey, GlyphOverride>();
  for (const { x, y, ...fields } of overrides) {
    const key = keyOf(x, y);
    const override = normalizeOverride(fields);
    if (override && cells.has(key)) out.set(key, override);
  }
  return out;
}

/** Деформеры и связи объекта различаются по id: два с одним id — испорченный файл. */
function uniqueIds<T extends { readonly id: string }>(
  objectId: string,
  what: string,
  list: T[],
): T[] {
  if (new Set(list.map((d) => d.id)).size !== list.length) {
    throw new DocumentFormatError(`Duplicate ${what} id in object ${objectId}`);
  }
  return list;
}

/** Родитель обязан быть в том же кадре, и цепочка родителей не должна замыкаться. */
function assertHierarchy(objects: readonly SceneObject[]): void {
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const obj of objects) {
    const seen = new Set<string>();
    for (let cur: SceneObject | undefined = obj; cur?.parentId; cur = byId.get(cur.parentId)) {
      if (!byId.has(cur.parentId)) {
        throw new DocumentFormatError(`Object ${cur.id} references unknown parent ${cur.parentId}`);
      }
      if (seen.has(cur.id)) throw new DocumentFormatError(`Object ${obj.id} is its own ancestor`);
      seen.add(cur.id);
    }
  }
}

export function objectsFromFile(
  objects: readonly ObjectFile[],
  layers: readonly Layer[],
): SceneObject[] {
  const layerIds = new Set(layers.map((l) => l.id));
  const ids = new Set<string>();
  const out = objects.map((obj): SceneObject => {
    if (ids.has(obj.id)) throw new DocumentFormatError(`Duplicate object id: ${obj.id}`);
    if (!layerIds.has(obj.layerId)) {
      throw new DocumentFormatError(`Object ${obj.id} references unknown layer ${obj.layerId}`);
    }
    ids.add(obj.id);
    const cells = cellsFromFile(obj.cells);
    return {
      id: obj.id,
      name: obj.name,
      layerId: obj.layerId,
      parentId: obj.parentId ?? null,
      transform: transformFromFile(obj, cells),
      visible: obj.visible,
      locked: obj.locked,
      opacity: obj.opacity ?? 1,
      tint: obj.tint === undefined ? null : normalizeHex(obj.tint),
      cells,
      overrides: overridesFromFile(obj.overrides ?? [], cells),
      deformers: uniqueIds(obj.id, 'deformer', obj.deformers ?? []),
      material: materialFromFile(obj.material),
      rig: rigFromFile(obj.rig),
      constraints: uniqueIds(obj.id, 'constraint', obj.constraints ?? []),
      props: obj.props ?? {},
    };
  });
  assertHierarchy(out);
  return out;
}
