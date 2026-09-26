@tool
class_name BytefallPlayer
extends Node2D
## Играет [BytefallAnimation]: кадр — один меш из квадов, фон и символ на символ, со
## своим шейдером для контура, свечения, блика и дизеринга.
##
## Меш кадра строится при первом показе и дальше берётся из кэша. Рисует он во внутренний
## элемент холста со своим материалом, так что поле [member CanvasItem.material] узла
## свободно. Цвет всей анимации меняется через [member CanvasItem.modulate], размер —
## [member cell_size].

const MeshBuilder := preload("bytefall_mesh.gd")
const GLYPH_SHADER := preload("bytefall_glyph.gdshader")

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
var _item := RID()
var _material := ShaderMaterial.new()


func _init() -> void:
	_material.shader = GLYPH_SHADER


func _enter_tree() -> void:
	_item = RenderingServer.canvas_item_create()
	RenderingServer.canvas_item_set_parent(_item, get_canvas_item())
	RenderingServer.canvas_item_set_material(_item, _material.get_rid())
	queue_redraw()


func _exit_tree() -> void:
	RenderingServer.free_rid(_item)
	_item = RID()


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
	if not _item.is_valid():
		return
	RenderingServer.canvas_item_clear(_item)
	if animation == null or animation.frame_count() == 0 or animation.atlas == null:
		return
	_material.set_shader_parameter("atlas", animation.atlas)
	_material.set_shader_parameter("materials", animation.material_texture)
	_material.set_shader_parameter(
		"atlas_grid", Vector2(animation.atlas_columns, animation.atlas_rows)
	)
	_material.set_shader_parameter("time", animation.times[_frame] / 1000.0)
	var origin := _origin()
	if draw_background and animation.background.a > 0.0:
		var size := Vector2(animation.canvas_size) * cell_size
		RenderingServer.canvas_item_add_rect(_item, Rect2(origin, size), animation.background)
	if not _meshes.has(_frame):
		_meshes[_frame] = MeshBuilder.new().build(animation, _frame, origin, cell_size)
	var mesh: ArrayMesh = _meshes[_frame]
	if mesh.get_surface_count() > 0:
		RenderingServer.canvas_item_add_mesh(_item, mesh.get_rid())


func _origin() -> Vector2:
	if not centered:
		return Vector2.ZERO
	return -Vector2(animation.canvas_size) * cell_size * 0.5
