import * as THREE from 'three';
import type { GlyphSource } from './glyphShader';

/**
 * Шейдеры потока символов. Символ рисуется в два слоя: сначала подложка всех символов прохода —
 * свечение и контур материала, потом сами символы с фоном. Иначе свечение символа, нарисованного
 * позже, легло бы поверх соседа, нарисованного раньше.
 *
 * Координаты внутри символа — в долях его ячейки (`vCell`): 0..1 — сама ячейка, за её краем —
 * поле материала. Форма глифа берётся из атласа только внутри ячейки: атлас кладёт глифы вплотную,
 * и выборка за краем взяла бы соседний глиф.
 */
const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aCenter;
  attribute vec3 aPose;
  attribute vec4 aUvRect;
  attribute vec4 aFg;
  attribute vec4 aBg;
  attribute vec4 aOutline;
  attribute vec4 aGlow;
  attribute float aGlowStrength;
  varying vec2 vCell;
  varying vec4 vRect;
  varying vec4 vFg;
  varying vec4 vBg;
  varying vec4 vOutline;
  varying vec4 vGlow;
  varying float vGlowStrength;

  void main() {
    vRect = aUvRect;
    vFg = aFg;
    vBg = aBg;
    vOutline = aOutline;
    vGlow = aGlow;
    vGlowStrength = aGlowStrength;
    #ifdef UNDER
      // Контур и свечение выходят за ячейку: квадрат шире на поле материала.
      float margin = max(aOutline.w, aGlow.w);
    #else
      float margin = 0.0;
    #endif
    vCell = mix(vec2(-margin), vec2(1.0 + margin), uv);
    // Квадрат символа вокруг его центра: масштаб, затем поворот (aPose.x, радианы). Ось Y
    // документа смотрит вниз, поэтому положительный угол поворачивает по часовой стрелке.
    vec2 local = (vCell - 0.5) * aPose.yz;
    float c = cos(aPose.x);
    float s = sin(aPose.x);
    vec2 doc = aCenter + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(doc.x, -doc.y, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vCell;
  varying vec4 vRect;
  varying vec4 vFg;
  varying vec4 vBg;
  varying vec4 vOutline;
  varying vec4 vGlow;
  varying float vGlowStrength;

  bool insideCell(vec2 cell) {
    return cell.x >= 0.0 && cell.y >= 0.0 && cell.x < 1.0 && cell.y < 1.0;
  }

  /** Покрыт ли пиксель глифом: бинарно, как в сетке, чтобы пиксельный шрифт не размывался. */
  float cover(vec2 cell) {
    if (!insideCell(cell)) return 0.0;
    return step(0.5, texture2D(uAtlas, mix(vRect.xy, vRect.zw, cell)).a);
  }

  /** «Поверх» для цветов с предумноженной альфой. */
  vec4 over(vec4 top, vec4 bottom) {
    return top + bottom * (1.0 - top.a);
  }

  /**
   * Свечение: размытая форма глифа — доля глифа в квадрате 7×7 выборок радиуса vGlow.w вокруг
   * пикселя с гауссовыми весами. У края символа около половины, к радиусу гаснет до нуля.
   */
  vec4 glow() {
    float sum = 0.0;
    float total = 0.0;
    for (int j = -3; j <= 3; j++) {
      for (int i = -3; i <= 3; i++) {
        vec2 step = vec2(float(i), float(j)) / 3.0;
        float weight = exp(-2.0 * dot(step, step));
        sum += weight * cover(vCell + step * vGlow.w);
        total += weight;
      }
    }
    float alpha = clamp(sum / total * vGlowStrength, 0.0, 1.0) * vFg.a;
    return vec4(vGlow.rgb * alpha, alpha);
  }

  /** Контур: пиксель вне глифа, рядом с которым глиф есть, на толщину и на половину её. */
  vec4 outline() {
    float hit = 0.0;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 dir = vec2(float(dx), float(dy));
        hit = max(hit, cover(vCell + dir * vOutline.w));
        hit = max(hit, cover(vCell + dir * vOutline.w * 0.5));
      }
    }
    float alpha = hit * vFg.a;
    return vec4(vOutline.rgb * alpha, alpha);
  }

  void main() {
    vec4 color = vec4(0.0);
    #ifdef UNDER
      if (vGlow.w > 0.0 && vGlowStrength > 0.0) color = glow();
      if (vOutline.w > 0.0 && cover(vCell) < 0.5) color = over(outline(), color);
    #else
      float glyph = cover(vCell) * vFg.a;
      if (insideCell(vCell)) color = vec4(vBg.rgb * vBg.a, vBg.a);
      color = over(vec4(vFg.rgb * glyph, glyph), color);
    #endif
    if (color.a <= 0.002) discard;
    gl_FragColor = vec4(color.rgb / color.a, color.a);
  }
`;

/** Материал потока: подложка (`under`) или сами символы. */
export function createInstanceMaterial(atlas: GlyphSource, under: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas.texture } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    defines: under ? { UNDER: '' } : {},
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}
