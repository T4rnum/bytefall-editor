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


## Меш кадра [param frame]: координаты в пикселях узла, [param origin] — где угол холста.
## Строитель одноразовый: на каждый кадр — новый.
func build(anim: BytefallAnimation, frame: int, origin: Vector2, cell_size: Vector2) -> ArrayMesh:
	_origin = origin
	_cell_size = cell_size
	var data := anim.data
	for i in range(anim.offsets[frame], anim.offsets[frame + 1]):
		var at := i * BytefallAnimation.GLYPH_BYTES
		var center := Vector2(data.decode_float(at), data.decode_float(at + 4))
		var xf := Transform2D(
			data.decode_float(at + 8),
			Vector2(data.decode_float(at + 12), data.decode_float(at + 16)),
			0.0,
			center
		)
		var glyph := data.decode_u16(at + 20)
		var flags := data.decode_u16(at + 22)
		var material := flags & ~BytefallAnimation.UNDER_BIT
		var fg := Color8(data[at + 24], data[at + 25], data[at + 26], data[at + 27])
		var bg := Color8(data[at + 28], data[at + 29], data[at + 30], data[at + 31])
		if flags & BytefallAnimation.UNDER_BIT:
			# Поле подложки — самое широкое из контура и свечения, в ячейках.
			var margin := maxf(anim.material_value(material, 3), anim.material_value(material, 7))
			_quad(xf, margin, fg, Vector3(glyph, material, MODE_UNDER))
			continue
		if bg.a > 0.0:
			_quad(xf, 0.0, bg, Vector3(0, 0, MODE_SOLID))
		if glyph > 0 and fg.a > 0.0:
			_quad(xf, 0.0, fg, Vector3(glyph, material, MODE_GLYPH))
	return _mesh()


## Квад вокруг центра символа: ячейка с полем [param margin], масштаб, поворот по часовой.
func _quad(xf: Transform2D, margin: float, color: Color, custom: Vector3) -> void:
	var lo := -0.5 - margin
	var hi := 0.5 + margin
	var corners := [Vector2(lo, lo), Vector2(hi, lo), Vector2(hi, hi), Vector2(lo, hi)]
	for k in [0, 1, 2, 0, 2, 3]:
		var doc: Vector2 = xf * corners[k]
		_verts.append(_origin + doc * _cell_size)
		_uvs.append(corners[k] + Vector2(0.5, 0.5))
		_colors.append(color)
		_custom0.append_array([custom.x, custom.y, custom.z, 0.0])
		_custom1.append_array([doc.x, doc.y, 0.0, 0.0])


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
