// Символы Bytefall: повторяет render/instanceShader.ts редактора, чтобы картинка совпадала.
//
// Квад несёт в CUSTOM0 номер ячейки атласа, номер материала (с 1, 0 — без материала) и режим:
// 0 — сплошной цвет (фон), 1 — символ, 2 — подложка (контур и свечение). В UV — координаты
// внутри ячейки символа (0..1, у подложки шире на поле), в CUSTOM1 — координаты документа.
shader_type canvas_item;
render_mode unshaded;

uniform sampler2D atlas : filter_nearest, repeat_disable;
// 5 текселей на материал: контур, свечение, (сила свечения, цвет блика), (ширина, шаг,
// скорость, угол блика), (дизеринг, мягкость свечения, строки развёртки, крупный пиксель).
uniform sampler2D materials : filter_nearest, repeat_disable;
uniform vec2 atlas_grid = vec2(1.0, 1.0);
// Момент сцены, секунды: по нему бежит блик.
uniform float time = 0.0;

varying vec2 cell;
varying vec2 doc;
varying flat vec4 rect;
varying flat float mode;
varying flat vec4 outline_m;
varying flat vec4 glow_m;
varying flat float glow_strength;
varying flat vec4 shine_m;
varying flat vec4 shine_motion;
// Мягкость свечения (1 — пятном), строки развёртки, сторона крупного пикселя.
varying flat vec3 extra;

void vertex() {
	cell = UV;
	doc = CUSTOM1.xy;
	mode = CUSTOM0.z;
	vec2 size = 1.0 / atlas_grid;
	vec2 at = vec2(mod(CUSTOM0.x, atlas_grid.x), floor(CUSTOM0.x / atlas_grid.x));
	rect = vec4(at * size, (at + 1.0) * size);
	int row = int(CUSTOM0.y + 0.5) - 1;
	outline_m = vec4(0.0);
	glow_m = vec4(0.0);
	glow_strength = 0.0;
	shine_m = vec4(0.0);
	shine_motion = vec4(0.0);
	extra = vec3(0.0);
	if (row >= 0) {
		outline_m = texelFetch(materials, ivec2(0, row), 0);
		glow_m = texelFetch(materials, ivec2(1, row), 0);
		vec4 t2 = texelFetch(materials, ivec2(2, row), 0);
		vec4 t3 = texelFetch(materials, ivec2(3, row), 0);
		glow_strength = t2.x;
		shine_m = vec4(t2.yzw, t3.x);
		vec4 t4 = texelFetch(materials, ivec2(4, row), 0);
		shine_motion = vec4(t3.yzw, t4.x);
		extra = t4.yzw;
	}
}

bool inside_cell(vec2 c) {
	return c.x >= 0.0 && c.y >= 0.0 && c.x < 1.0 && c.y < 1.0;
}

// Покрыт ли пиксель глифом: бинарно, чтобы пиксельный шрифт не размывался. Крупный пиксель
// берёт центр пикселя шрифта посреди своего блока, не границу между пикселями.
float cover(vec2 c) {
	if (!inside_cell(c)) return 0.0;
	if (extra.z > 1.0) {
		float n = extra.z;
		c = (min(floor(c * 8.0 / n) * n + floor(n * 0.5), vec2(7.0)) + 0.5) / 8.0;
	}
	return step(0.5, texture(atlas, mix(rect.xy, rect.zw, c)).a);
}

// «Поверх» для цветов с предумноженной альфой.
vec4 over(vec4 top, vec4 bottom) {
	return top + bottom * (1.0 - top.a);
}

vec4 glow(float fg_alpha) {
	float sum = 0.0;
	float total = 0.0;
	for (int j = -3; j <= 3; j++) {
		for (int i = -3; i <= 3; i++) {
			vec2 s = vec2(float(i), float(j)) / 3.0;
			float weight = exp(-2.0 * dot(s, s));
			sum += weight * cover(cell + s * glow_m.w);
			total += weight;
		}
	}
	float alpha = clamp(sum / total * glow_strength, 0.0, 1.0) * fg_alpha;
	return vec4(glow_m.rgb * alpha, alpha);
}

// Мягкое свечение: пятно вокруг символа без его формы, к радиусу гаснет по Гауссу.
vec4 soft_glow(float fg_alpha) {
	float d = max(0.0, length(cell - 0.5) - 0.35) / max(glow_m.w, 0.001);
	float alpha = clamp(exp(-2.0 * d * d) * 0.5 * glow_strength, 0.0, 1.0) * fg_alpha;
	return vec4(glow_m.rgb * alpha, alpha);
}

vec4 outline(float fg_alpha) {
	float hit = 0.0;
	for (int dy = -1; dy <= 1; dy++) {
		for (int dx = -1; dx <= 1; dx++) {
			vec2 dir = vec2(float(dx), float(dy));
			hit = max(hit, cover(cell + dir * outline_m.w));
			hit = max(hit, cover(cell + dir * outline_m.w * 0.5));
		}
	}
	float alpha = hit * fg_alpha;
	return vec4(outline_m.rgb * alpha, alpha);
}

float bayer2(vec2 a) {
	a = floor(a);
	return fract(dot(a, vec2(0.5, a.y * 0.75)));
}

float bayer4(vec2 a) {
	return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

float shine() {
	vec2 dir = vec2(cos(shine_motion.z), sin(shine_motion.z));
	float spacing = max(shine_motion.x, 0.001);
	float along = dot(doc, dir) - shine_motion.y * time;
	float dist = abs(fract(along / spacing + 0.5) - 0.5) * spacing;
	return clamp(1.0 - dist / max(shine_m.w * 0.5, 0.001), 0.0, 1.0);
}

void fragment() {
	if (mode > 1.5) {
		vec4 c = vec4(0.0);
		if (glow_m.w > 0.0 && glow_strength > 0.0) c = extra.x > 0.5 ? soft_glow(COLOR.a) : glow(COLOR.a);
		if (outline_m.w > 0.0 && cover(cell) < 0.5) c = over(outline(COLOR.a), c);
		COLOR = c.a > 0.0 ? vec4(c.rgb / c.a, c.a) : vec4(0.0);
	} else if (mode > 0.5) {
		float glyph = cover(cell);
		if (shine_motion.w > 0.0 && bayer4(floor(cell * 8.0)) < shine_motion.w) glyph = 0.0;
		vec3 fg = COLOR.rgb;
		if (shine_m.w > 0.0) fg = mix(fg, shine_m.rgb, shine());
		if (extra.y > 0.0 && mod(floor(cell.y * 8.0), 2.0) > 0.5) fg *= 1.0 - extra.y;
		COLOR = vec4(fg, glyph * COLOR.a);
	} else if (extra.y > 0.0 && mod(floor(cell.y * 8.0), 2.0) > 0.5) {
		// Фон под символом с развёрткой темнеет теми же строками.
		COLOR.rgb *= 1.0 - extra.y;
	}
}
