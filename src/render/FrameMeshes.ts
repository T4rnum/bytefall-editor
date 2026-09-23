import * as THREE from 'three';
import type { Frame } from '../core/frame';
import { GridMesh } from './GridMesh';
import type { GlyphSource } from './glyphShader';
import { InstanceMesh } from './InstanceMesh';
import { RENDER_ORDER } from './order';

type Slot =
  | { readonly kind: 'cells'; readonly mesh: GridMesh }
  | { readonly kind: 'glyphs'; readonly mesh: InstanceMesh };

/**
 * Меши проходов кадра: сетка на каждый проход ячеек, поток инстансов на каждый проход символов.
 * Меш живёт, пока на его месте проход того же вида, и пересоздаётся, только если вид сменился:
 * GPU-буфер сетки размером во весь холст дорого выделять на каждый кадр.
 */
export class FrameMeshes {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];

  constructor(private readonly atlas: GlyphSource) {}

  /**
   * Переносит кадр на GPU. `full` требует залить всё; иначе проходы ячеек получают только тайлы
   * из `frame.dirty`. Новый меш заливается целиком в любом случае: в нём ещё ничего нет.
   */
  apply(frame: Frame, full = false): void {
    frame.passes.forEach((pass, index) => {
      let slot = this.slots[index];
      const fresh = slot?.kind !== pass.kind;
      if (fresh) {
        if (slot) this.release(slot);
        slot = this.create(pass.kind, index);
        this.slots[index] = slot;
      }
      if (pass.kind === 'cells' && slot.kind === 'cells') {
        const dirty = full || fresh || frame.dirty === null ? undefined : frame.dirty;
        slot.mesh.update(pass.buffer, dirty);
      } else if (pass.kind === 'glyphs' && slot.kind === 'glyphs') {
        slot.mesh.update(pass.batch);
      }
    });
    for (const extra of this.slots.splice(frame.passes.length)) this.release(extra);
  }

  /** Атлас вырос, пока кадр стоял на экране: старые UV больше не указывают на свои символы. */
  refreshStale(frame: Frame | null): void {
    this.slots.forEach((slot, index) => {
      if (slot.kind === 'glyphs') {
        if (slot.mesh.needsRefresh()) slot.mesh.refresh();
        return;
      }
      const pass = frame?.passes[index];
      if (pass?.kind === 'cells' && slot.mesh.needsRefresh()) slot.mesh.update(pass.buffer);
    });
  }

  dispose(): void {
    for (const slot of this.slots) this.release(slot);
    this.slots = [];
  }

  private create(kind: Slot['kind'], index: number): Slot {
    const slot: Slot =
      kind === 'cells'
        ? { kind, mesh: new GridMesh(this.atlas) }
        : { kind, mesh: new InstanceMesh(this.atlas) };
    slot.mesh.mesh.renderOrder = RENDER_ORDER.content + index;
    this.group.add(slot.mesh.mesh);
    return slot;
  }

  private release(slot: Slot): void {
    this.group.remove(slot.mesh.mesh);
    slot.mesh.dispose();
  }
}
