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
 *
 * `uGrid` — сетка шрифта, пикселей шрифта в ячейке. Пиксели шрифта квадратные, поэтому отношение
 * сторон ячейки — `uGrid.x / uGrid.y`. Поворот, радиус свечения и блик считаются в видимом
 * пространстве, где X ячейки умножен на это отношение (`docs/DESIGN.md`, раздел 3): тогда символ
 * неквадратной ячейки вращается как жёсткое тело, а свечение остаётся круглым.
 */
const GRID = /* glsl */ `
  uniform vec2 uGrid;
  float aspect() {
    return uGrid.x / uGrid.y;
  }
`;

const VERTEX_SHADER = /* glsl */ `
  ${GRID}
  attribute vec2 aCenter;
  attribute vec3 aPose;
  attribute vec4 aUvRect;
  attribute vec4 aFg;
  attribute vec4 aBg;
  attribute vec4 aOutline;
  attribute vec4 aGlow;
  attribute float aGlowStrength;
  attribute vec4 aShine;
  attribute vec4 aShineMotion;
  attribute vec3 aExtra;
  varying vec2 vCell;
  varying vec2 vDoc;
  varying vec4 vShine;
  varying vec4 vShineMotion;
  varying vec4 vRect;
  varying vec4 vFg;
  varying vec4 vBg;
  varying vec4 vOutline;
  varying vec4 vGlow;
  varying float vGlowStrength;
  varying vec3 vExtra;

  void main() {
    vRect = aUvRect;
    vExtra = aExtra;
    vFg = aFg;
    vBg = aBg;
    vOutline = aOutline;
    vGlow = aGlow;
    vGlowStrength = aGlowStrength;
    vShine = aShine;
    vShineMotion = aShineMotion;
    #ifdef UNDER
      // Контур и свечение выходят за ячейку: квадрат шире на поле материала. Контур задан в
      // пикселях шрифта, свечение — в высотах ячейки.
      vec2 margin = max(vec2(aOutline.w) / uGrid, vec2(aGlow.w / aspect(), aGlow.w));
    #else
      vec2 margin = vec2(0.0);
    #endif
    vCell = mix(-margin, vec2(1.0) + margin, uv);
    // Символ вокруг его центра: масштаб, затем поворот (aPose.x, радианы) в видимом
    // пространстве. Ось Y документа смотрит вниз, поэтому положительный угол поворачивает по
    // часовой стрелке.
    vec2 wide = vec2(aspect(), 1.0);
    vec2 local = (vCell - 0.5) * aPose.yz * wide;
    float c = cos(aPose.x);
    float s = sin(aPose.x);
    vec2 doc = aCenter + vec2(c * local.x - s * local.y, s * local.x + c * local.y) / wide;
    vDoc = doc * wide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(doc.x, -doc.y, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  ${GRID}
  uniform sampler2D uAtlas;
  /** Время кадра, секунды: по нему бежит блик, одинаково на экране и в экспорте. */
  uniform float uTime;
  varying vec2 vCell;
  varying vec2 vDoc;
  varying vec4 vShine;
  varying vec4 vShineMotion;
  varying vec4 vRect;
  varying vec4 vFg;
  varying vec4 vBg;
  varying vec4 vOutline;
  varying vec4 vGlow;
  varying float vGlowStrength;
  /** Мягкость свечения (1 — пятном), строки развёртки, сторона крупного пикселя. */
  varying vec3 vExtra;

  bool insideCell(vec2 cell) {
    return cell.x >= 0.0 && cell.y >= 0.0 && cell.x < 1.0 && cell.y < 1.0;
  }

  /**
   * Покрыт ли пиксель глифом: бинарно, как в сетке, чтобы пиксельный шрифт не размывался. Крупный
   * пиксель берёт пиксель шрифта посреди своего блока — его центр, а не границу между пикселями,
   * где выбор текселя у каждого GPU свой. Контур и свечение идут за крупной формой.
   */
  float cover(vec2 cell) {
    if (!insideCell(cell)) return 0.0;
    if (vExtra.z > 1.0) {
      float n = vExtra.z;
      cell = (min(floor(cell * uGrid / n) * n + floor(n * 0.5), uGrid - 1.0) + 0.5) / uGrid;
    }
    return step(0.5, texture2D(uAtlas, mix(vRect.xy, vRect.zw, cell)).a);
  }

  /** «Поверх» для цветов с предумноженной альфой. */
  vec4 over(vec4 top, vec4 bottom) {
    return top + bottom * (1.0 - top.a);
  }

  /**
   * Свечение: размытая форма глифа — доля глифа в квадрате 7×7 выборок радиуса vGlow.w вокруг
   * пикселя с гауссовыми весами. У края символа около половины, к радиусу гаснет до нуля.
   * Радиус — в высотах ячейки: по X в долях ячейки он делится на отношение сторон.
   */
  vec4 glow() {
    float sum = 0.0;
    float total = 0.0;
    vec2 radius = vec2(vGlow.w / aspect(), vGlow.w);
    for (int j = -3; j <= 3; j++) {
      for (int i = -3; i <= 3; i++) {
        vec2 step = vec2(float(i), float(j)) / 3.0;
        float weight = exp(-2.0 * dot(step, step));
        sum += weight * cover(vCell + step * radius);
        total += weight;
      }
    }
    float alpha = clamp(sum / total * vGlowStrength, 0.0, 1.0) * vFg.a;
    return vec4(vGlow.rgb * alpha, alpha);
  }

  /**
   * Мягкое свечение: пятно вокруг символа без его формы, как свечение постобработки. Внутри
   * символа — половина силы, как у края формы, к радиусу за краем гаснет по Гауссу.
   */
  vec4 softGlow() {
    vec2 fromCenter = (vCell - 0.5) * vec2(aspect(), 1.0);
    float d = max(0.0, length(fromCenter) - 0.35) / max(vGlow.w, 0.001);
    float alpha = clamp(exp(-2.0 * d * d) * 0.5 * vGlowStrength, 0.0, 1.0) * vFg.a;
    return vec4(vGlow.rgb * alpha, alpha);
  }

  /**
   * Контур: пиксель вне глифа, рядом с которым глиф есть, на толщину и на половину её. Толщина —
   * в пикселях шрифта.
   */
  vec4 outline() {
    float hit = 0.0;
    vec2 width = vec2(vOutline.w) / uGrid;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 dir = vec2(float(dx), float(dy));
        hit = max(hit, cover(vCell + dir * width));
        hit = max(hit, cover(vCell + dir * width * 0.5));
      }
    }
    float alpha = hit * vFg.a;
    return vec4(vOutline.rgb * alpha, alpha);
  }

  /** Порог Байера 4×4 для пикселя шрифта: узор привязан к символу, а не к экрану. */
  float bayer2(vec2 a) {
    a = floor(a);
    return fract(dot(a, vec2(0.5, a.y * 0.75)));
  }
  float bayer4(vec2 a) {
    return bayer2(0.5 * a) * 0.25 + bayer2(a);
  }

  /**
   * Блик: полосы шириной vShine.w через каждые vShineMotion.x ячеек, бегут со скоростью
   * vShineMotion.y по направлению vShineMotion.z в координатах документа.
   */
  float shine() {
    vec2 dir = vec2(cos(vShineMotion.z), sin(vShineMotion.z));
    float spacing = max(vShineMotion.x, 0.001);
    float along = dot(vDoc, dir) - vShineMotion.y * uTime;
    float dist = abs(fract(along / spacing + 0.5) - 0.5) * spacing;
    return clamp(1.0 - dist / max(vShine.w * 0.5, 0.001), 0.0, 1.0);
  }

  void main() {
    vec4 color = vec4(0.0);
    #ifdef UNDER
      if (vGlow.w > 0.0 && vGlowStrength > 0.0) color = vExtra.x > 0.5 ? softGlow() : glow();
      if (vOutline.w > 0.0 && cover(vCell) < 0.5) color = over(outline(), color);
    #else
      float glyph = cover(vCell);
      // Дизеринг: пиксель шрифта пропадает, если его порог ниже доли узора.
      if (vShineMotion.w > 0.0 && bayer4(floor(vCell * uGrid)) < vShineMotion.w) glyph = 0.0;
      vec3 fg = vFg.rgb;
      if (vShine.w > 0.0) fg = mix(fg, vShine.rgb, shine());
      glyph *= vFg.a;
      if (insideCell(vCell)) color = vec4(vBg.rgb * vBg.a, vBg.a);
      color = over(vec4(fg * glyph, glyph), color);
      // Строки развёртки: каждая вторая строка пикселей шрифта темнее, и символ, и фон.
      if (vExtra.y > 0.0 && mod(floor(vCell.y * uGrid.y), 2.0) > 0.5) color.rgb *= 1.0 - vExtra.y;
    #endif
    if (color.a <= 0.002) discard;
    gl_FragColor = vec4(color.rgb / color.a, color.a);
  }
`;

/** Материал потока: подложка (`under`) или сами символы. */
export function createInstanceMaterial(atlas: GlyphSource, under: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas.texture },
      uTime: { value: 0 },
      uGrid: { value: new THREE.Vector2(atlas.gridWidth, atlas.gridHeight) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    defines: under ? { UNDER: '' } : {},
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}
