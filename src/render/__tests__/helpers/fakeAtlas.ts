import * as THREE from 'three';
import type { GlyphRect } from '../../font/GlyphAtlas';
import type { GlyphSource } from '../../glyphShader';

/** Атлас-заглушка: настоящий растеризует глифы через Canvas2D, которого вне браузера нет. */
export class FakeAtlas implements GlyphSource {
  readonly texture = new THREE.Texture();
  version = 0;
  private readonly rects = new Map<string, GlyphRect>();

  getRect(glyph: string): GlyphRect {
    let rect = this.rects.get(glyph);
    if (!rect) {
      // Уникальные, но детерминированные координаты: по ним видно, какой глиф попал в слот.
      const i = this.rects.size + 1;
      rect = { u0: i / 100, v0: 0, u1: i / 100 + 0.01, v1: 1 };
      this.rects.set(glyph, rect);
    }
    return rect;
  }
}
