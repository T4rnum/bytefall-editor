import { type Affine, IDENTITY, applyAffine, invertAffine, multiply } from './affine';
import type { DeformContext, DeformerCommon, GlyphPose } from './deformers';
import { segmentDistance } from './geometry';
import { type CellKey, xOf, yOf } from './grid';
import { wrapAngle } from './ik';

/** Кость скиннинга: какая и где она была относительно объекта в позе покоя. */
export interface SkinBone {
  readonly id: string;
  /** Матрица кости в координатах объекта в момент привязки. */
  readonly bind: Affine;
  readonly length: number;
}

/**
 * Скиннинг (DESIGN.md, раздел 4.3): символы объекта едут за костями. Символ помнит, где он был
 * в позе покоя, и каждая кость переносит его так, как сама сдвинулась от покоя; веса смешивают
 * переносы ближних костей. Вес — по расстоянию символа до кости в позе покоя.
 */
export interface SkinDeformer extends DeformerCommon {
  readonly kind: 'skin';
  readonly bones: readonly SkinBone[];
  /** На сколько ячеек дальше ближней кости ещё тянет соседняя: мягкость сгиба. */
  readonly falloff: number;
}

export const MAX_SKIN_BONES = 32;
export const MIN_FALLOFF = 0.25;
export const MAX_FALLOFF = 64;

type Influence = readonly [bone: number, weight: number];

/** Веса по исходной ячейке: считаются раз на деформер, пока привязка та же. */
const weightCache = new WeakMap<SkinDeformer, Map<CellKey, readonly Influence[]>>();

/**
 * Веса символа ячейки `key`: ближняя кость в полную силу, остальные — чем ближе к ней, тем
 * сильнее, до `falloff` ячеек сверх её расстояния. Сумма весов — единица.
 */
function influences(d: SkinDeformer, key: CellKey): readonly Influence[] {
  let cache = weightCache.get(d);
  if (!cache) weightCache.set(d, (cache = new Map<CellKey, readonly Influence[]>()));
  const known = cache.get(key);
  if (known) return known;
  const center = { x: xOf(key) + 0.5, y: yOf(key) + 0.5 };
  const distances = d.bones.map((b) =>
    segmentDistance(center, applyAffine(b.bind, 0, 0), applyAffine(b.bind, b.length, 0)),
  );
  const nearest = Math.min(...distances);
  const falloff = Math.max(MIN_FALLOFF, d.falloff);
  const raw = distances.map((dist, i): Influence => [
    i,
    Math.max(0, 1 - (dist - nearest) / falloff),
  ]);
  const kept = raw.filter(([, w]) => w > 0);
  const total = kept.reduce((sum, [, w]) => sum + w, 0);
  const out = kept.map(([i, w]): Influence => [i, w / total]);
  cache.set(key, out);
  return out;
}

/**
 * Кости скиннинга сейчас в координатах объекта: из матриц мира. Их даёт `drawDocument` тем
 * объектам, у кого есть скиннинг. undefined — скиннинга нет.
 */
export function skinRig(
  obj: { readonly id: string; readonly deformers: readonly { readonly kind: string }[] },
  matrices: ReadonlyMap<string, Affine>,
): ReadonlyMap<string, Affine> | undefined {
  const skins = obj.deformers.filter((d): d is SkinDeformer => d.kind === 'skin');
  const world = matrices.get(obj.id);
  const inverse = world && invertAffine(world);
  if (skins.length === 0 || !inverse) return undefined;
  const out = new Map<string, Affine>();
  for (const bone of skins.flatMap((d) => d.bones)) {
    const m = matrices.get(bone.id);
    if (m) out.set(bone.id, multiply(inverse, m));
  }
  return out;
}

export function skin(poses: GlyphPose[], d: SkinDeformer, ctx: DeformContext): void {
  if (d.bones.length === 0) return;
  // Перенос кости от покоя к сейчас; пропавшая кость стоит в покое.
  const moves = d.bones.map((b) => {
    const now = ctx.rig?.get(b.id);
    const rest = invertAffine(b.bind);
    return now && rest ? multiply(now, rest) : IDENTITY;
  });
  const turns = moves.map((m) => (Math.atan2(m.b, m.a) * 180) / Math.PI);
  for (const p of poses) {
    const weights = influences(d, p.key);
    const base = turns[weights[0][0]];
    let x = 0;
    let y = 0;
    let turn = 0;
    for (const [i, w] of weights) {
      const q = applyAffine(moves[i], p.x, p.y);
      x += q.x * w;
      y += q.y * w;
      turn += wrapAngle(turns[i] - base) * w;
    }
    p.x = x;
    p.y = y;
    p.rot += base + turn;
  }
}
