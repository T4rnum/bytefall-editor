@tool
class_name BytefallPlayer
extends Node2D
## Играет [BytefallAnimation]: кадр — один меш из квадов, фон и символ на символ.
##
## Меш кадра строится при первом показе и дальше берётся из кэша. Цвет всей
## анимации меняется через [member CanvasItem.modulate], размер — [member cell_size].

signal finished

@export var animation: BytefallAnimation:
	set(value):
		animation = value
		_meshes.clear()
		_time = 0.0
		_frame = 0
		queue_redraw()
## Размер ячейки в пикселях.
@export var cell_size := Vector2(16, 16):
	set(value):
		cell_size = value
		_meshes.clear()
		queue_redraw()
## Центр холста в начале координат узла; иначе там левый верхний угол.
@export var centered := true:
	set(value):
		centered = value
		_meshes.clear()
		queue_redraw()
## Рисовать цвет холста под символами.
@export var draw_background := true:
	set(value):
		draw_background = value
		queue_redraw()
@export var autoplay := true
@export var loop := true
@export var speed_scale := 1.0

var playing := false
var _time := 0.0
var _frame := 0
var _meshes := {}


func _init() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST


func _ready() -> void:
	if autoplay and not Engine.is_editor_hint():
		play()


func play() -> void:
	playing = true


func stop() -> void:
	playing = false
	seek(0.0)


## Время от начала анимации, мс.
func get_time() -> float:
	return _time


func get_frame() -> int:
	return _frame


## Переходит к моменту [param time_ms] от начала.
func seek(time_ms: float) -> void:
	if animation == null or animation.frame_count() == 0:
		return
	var total := animation.total_duration()
	_time = fposmod(time_ms, total) if loop else clampf(time_ms, 0.0, total)
	var frame := _frame_at(_time)
	if frame != _frame:
		_frame = frame
		queue_redraw()


func _frame_at(time_ms: float) -> int:
	var start := 0.0
	for i in animation.frame_count():
		start += animation.durations[i]
		if time_ms < start:
			return i
	return animation.frame_count() - 1


func _process(delta: float) -> void:
	if not playing or animation == null or animation.frame_count() == 0:
		return
	var total := animation.total_duration()
	var next := _time + delta * 1000.0 * speed_scale
	if not loop and next >= total:
		seek(total)
		playing = false
		finished.emit()
		return
	seek(next)


func _draw() -> void:
	if animation == null or animation.frame_count() == 0 or animation.atlas == null:
		return
	var origin := _origin()
	if draw_background and animation.background.a > 0.0:
		draw_rect(Rect2(origin, Vector2(animation.canvas_size) * cell_size), animation.background)
	if not _meshes.has(_frame):
		_meshes[_frame] = _build_mesh(_frame)
	var mesh: ArrayMesh = _meshes[_frame]
	if mesh.get_surface_count() > 0:
		draw_mesh(mesh, animation.atlas)


func _origin() -> Vector2:
	if not centered:
		return Vector2.ZERO
	return -Vector2(animation.canvas_size) * cell_size * 0.5


## Ячейка атласа в долях текстуры.
func _cell_rect(index: int) -> Rect2:
	var size := Vector2(1.0 / animation.atlas_columns, 1.0 / animation.atlas_rows)
	var columns := animation.atlas_columns
	var cell := Vector2(index % columns, floori(float(index) / columns))
	return Rect2(cell * size, size)


func _build_mesh(frame: int) -> ArrayMesh:
	var verts := PackedVector2Array()
	var uvs := PackedVector2Array()
	var colors := PackedColorArray()
	var data := animation.data
	var white := _cell_rect(0).get_center()
	var origin := _origin()
	for i in range(animation.offsets[frame], animation.offsets[frame + 1]):
		var at := i * BytefallAnimation.GLYPH_BYTES
		var center := Vector2(data.decode_float(at), data.decode_float(at + 4))
		var rot := data.decode_float(at + 8)
		var size := Vector2(data.decode_float(at + 12), data.decode_float(at + 16))
		var glyph := data.decode_u16(at + 20)
		var fg := Color8(data[at + 24], data[at + 25], data[at + 26], data[at + 27])
		var bg := Color8(data[at + 28], data[at + 29], data[at + 30], data[at + 31])
		var xf := Transform2D(rot, size, 0.0, center)
		if bg.a > 0.0:
			_add_quad(verts, uvs, colors, xf, origin, Rect2(white, Vector2.ZERO), bg)
		if glyph > 0 and fg.a > 0.0:
			_add_quad(verts, uvs, colors, xf, origin, _cell_rect(glyph), fg)
	var mesh := ArrayMesh.new()
	if verts.is_empty():
		return mesh
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_COLOR] = colors
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


## Квадрат символа: единичная ячейка вокруг центра, масштаб, поворот по часовой.
func _add_quad(
	verts: PackedVector2Array,
	uvs: PackedVector2Array,
	colors: PackedColorArray,
	xf: Transform2D,
	origin: Vector2,
	uv: Rect2,
	color: Color
) -> void:
	var corners := [Vector2(-0.5, -0.5), Vector2(0.5, -0.5), Vector2(0.5, 0.5), Vector2(-0.5, 0.5)]
	var uv_corners := [
		uv.position, Vector2(uv.end.x, uv.position.y), uv.end, Vector2(uv.position.x, uv.end.y)
	]
	for k in [0, 1, 2, 0, 2, 3]:
		verts.append(origin + (xf * corners[k]) * cell_size)
		uvs.append(uv_corners[k])
		colors.append(color)
