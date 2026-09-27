@tool
extends RefCounted
## Меш кадра [BytefallAnimation] для шейдера `bytefall_glyph.gdshader`: на символ квад фона,
## квад символа, а у символа с контуром или свечением ещё подложка шире ячейки.

const MODE_SOLID := 0.0
const MODE_GLYPH := 1.0
const MODE_UNDER := 2.0
const CUSTOM_FLAGS := (
	(Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT)
	| (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)
)

var _verts := PackedVector2Array()
var _uvs := PackedVector2Array()
var _colors := PackedColorArray()
var _custom0 := PackedFloat32Array()
var _custom1 := PackedFloat32Array()
var _origin: Vector2
var _cell_size: Vector2
## Ширина ячейки к высоте: поворот и масштаб символа заданы на экране, где X ячейки умножен на
## это отношение, — так символ неквадратной ячейки вращается как жёсткое тело.
var _aspect := 1.0


## Меш кадра [param frame]: координаты в пикселях узла, [param origin] — где угол холста,
## [param cell_size] — ячейка в пикселях. Строитель одноразовый: на каждый кадр — новый.
func build(anim: BytefallAnimation, frame: int, origin: Vector2, cell_size: Vector2) -> ArrayMesh:
	_origin = origin
	_cell_size = cell_size
	_aspect = anim.cell_aspect()
	var data := anim.data
	for i in range(anim.offsets[frame], anim.offsets[frame + 1]):
		var at := i * BytefallAnimation.GLYPH_BYTES
		var center := Vector2(data.decode_float(at), data.decode_float(at + 4))
		var rot := data.decode_float(at + 8)
		var scale := Vector2(data.decode_float(at + 12), data.decode_float(at + 16))
		var glyph := data.decode_u16(at + 20)
		var flags := data.decode_u16(at + 22)
		var material := flags & ~BytefallAnimation.UNDER_BIT
		var fg := Color8(data[at + 24], data[at + 25], data[at + 26], data[at + 27])
		var bg := Color8(data[at + 28], data[at + 29], data[at + 30], data[at + 31])
		if flags & BytefallAnimation.UNDER_BIT:
			# Поле подложки в долях ячейки — самое широкое из контура (в пикселях шрифта) и
			# свечения (в высотах ячейки).
			var outline := anim.material_value(material, BytefallAnimation.OUTLINE_WIDTH)
			var glow := anim.material_value(material, 7)
			var margin := (Vector2(outline, outline) / anim.grid).max(Vector2(glow / _aspect, glow))
			_quad(center, rot, scale, margin, fg, Vector3(glyph, material, MODE_UNDER))
			continue
		if bg.a > 0.0:
			_quad(center, rot, scale, Vector2.ZERO, bg, Vector3(0, material, MODE_SOLID))
		if glyph > 0 and fg.a > 0.0:
			_quad(center, rot, scale, Vector2.ZERO, fg, Vector3(glyph, material, MODE_GLYPH))
	return _mesh()


## Квад вокруг центра символа: ячейка с полем [param margin], масштаб, поворот по часовой —
## на экране, в видимом пространстве, и обратно в ячейки.
func _quad(
	center: Vector2, rot: float, scale: Vector2, margin: Vector2, color: Color, custom: Vector3
) -> void:
	var lo := -Vector2(0.5, 0.5) - margin
	var hi := Vector2(0.5, 0.5) + margin
	var corners := [lo, Vector2(hi.x, lo.y), hi, Vector2(lo.x, hi.y)]
	var wide := Vector2(_aspect, 1.0)
	for k in [0, 1, 2, 0, 2, 3]:
		var corner: Vector2 = corners[k]
		var doc: Vector2 = center + (corner * scale * wide).rotated(rot) / wide
		_verts.append(_origin + doc * _cell_size)
		_uvs.append(corner + Vector2(0.5, 0.5))
		_colors.append(color)
		_custom0.append_array([custom.x, custom.y, custom.z, 0.0])
		# Блик бежит по экрану: координаты документа — в видимом пространстве.
		_custom1.append_array([doc.x * _aspect, doc.y, 0.0, 0.0])


func _mesh() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	if _verts.is_empty():
		return mesh
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = _verts
	arrays[Mesh.ARRAY_TEX_UV] = _uvs
	arrays[Mesh.ARRAY_COLOR] = _colors
	arrays[Mesh.ARRAY_CUSTOM0] = _custom0
	arrays[Mesh.ARRAY_CUSTOM1] = _custom1
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, CUSTOM_FLAGS)
	return mesh
