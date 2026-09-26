@tool
class_name BytefallAnimation
extends Resource
## Анимация из Bytefall Editor: атлас символов и поток символов на каждый кадр.
##
## Файл `.bytefall` превращается в этот ресурс при импорте, в игре его играет
## [BytefallPlayer]. Раскладка файла описана в `src/core/bytefall.ts` редактора.

const MAGIC := "BYTEFALL"
const VERSION := 2
const GLYPH_BYTES := 32
## Чисел на материал в таблице, раскладка — `src/core/material.ts`.
const MATERIAL_FLOATS := 20
## Чисел на материал в файлах версии 1: без мягкости свечения, развёртки и крупных пикселей.
const V1_MATERIAL_FLOATS := 17
## Старший бит поля материала: запись — подложка символа (контур и свечение).
const UNDER_BIT := 0x8000

## Размер холста в ячейках.
@export var canvas_size := Vector2i.ZERO
## Цвет холста. Альфа 0 — холст прозрачный.
@export var background := Color(0, 0, 0, 0)
@export var fps := 20.0
## Атлас: ячейка 0 белая, символ [member glyphs][i] — в ячейке i + 1.
@export var atlas: Texture2D
@export var atlas_columns := 1
@export var atlas_rows := 1
@export var glyphs := PackedStringArray()
## Таблица материалов, по [constant MATERIAL_FLOATS] чисел подряд.
@export var materials := PackedFloat32Array()
## Та же таблица текстурой для шейдера: 5 текселей RGBA на материал, строка на материал.
@export var material_texture: Texture2D
## Момент сцены каждого кадра, мс: по нему бежит блик.
@export var times := PackedFloat32Array()
## Длительность каждого кадра, мс.
@export var durations := PackedFloat32Array()
## Начало кадра в [member data] в символах; последний элемент — число всех символов.
@export var offsets := PackedInt32Array()
## Символы всех кадров подряд, по 32 байта.
@export var data := PackedByteArray()


## Число кадров.
func frame_count() -> int:
	return durations.size()


## Длительность всей анимации, мс.
func total_duration() -> float:
	var sum := 0.0
	for d in durations:
		sum += d
	return sum


## Читает файл `.bytefall` из байтов. Чужой или оборванный файл — null и ошибка в журнале.
static func from_bytes(bytes: PackedByteArray) -> BytefallAnimation:
	if bytes.size() < 16 or bytes.slice(0, 8).get_string_from_ascii() != MAGIC:
		push_error("Bytefall: это не файл .bytefall")
		return null
	var version := bytes.decode_u16(8)
	if version > VERSION:
		push_error("Bytefall: файл новее рантайма, обновите аддон")
		return null
	var at := 12
	var json_length := bytes.decode_u32(at)
	var header: Variant = JSON.parse_string(
		bytes.slice(at + 4, at + 4 + json_length).get_string_from_utf8()
	)
	if typeof(header) != TYPE_DICTIONARY:
		push_error("Bytefall: заголовок не читается")
		return null
	at += 4 + json_length
	var png_length := bytes.decode_u32(at)
	var image := Image.new()
	if image.load_png_from_buffer(bytes.slice(at + 4, at + 4 + png_length)) != OK:
		push_error("Bytefall: атлас не читается")
		return null
	at += 4 + png_length

	var anim := BytefallAnimation.new()
	anim.canvas_size = Vector2i(int(header.width), int(header.height))
	if header.background != null:
		anim.background = Color.html(header.background)
	anim.fps = float(header.fps)
	anim.atlas = ImageTexture.create_from_image(image)
	anim.atlas_columns = int(header.atlas.columns)
	anim.atlas_rows = int(header.atlas.rows)
	anim.glyphs = PackedStringArray(header.atlas.glyphs)
	var stride := MATERIAL_FLOATS if version >= 2 else V1_MATERIAL_FLOATS
	anim.materials = _widen(PackedFloat32Array(header.get("materials", [])), stride)
	anim.material_texture = _material_texture(anim.materials)
	var total := 0
	for frame in header.frames:
		anim.times.append(float(frame.get("time", 0.0)))
		anim.durations.append(float(frame.duration))
		anim.offsets.append(total)
		total += int(frame.count)
	anim.offsets.append(total)
	if at + total * GLYPH_BYTES > bytes.size():
		push_error("Bytefall: файл оборван")
		return null
	anim.data = bytes.slice(at, at + total * GLYPH_BYTES)
	return anim


## Таблица старой версии с [param stride] числами на материал — в нынешнюю раскладку: хвост,
## которого в файле не было, — нули.
@warning_ignore("integer_division")
static func _widen(values: PackedFloat32Array, stride: int) -> PackedFloat32Array:
	if stride == MATERIAL_FLOATS:
		return values
	var count := values.size() / stride
	var out := PackedFloat32Array()
	out.resize(count * MATERIAL_FLOATS)
	for row in count:
		for k in stride:
			out[row * MATERIAL_FLOATS + k] = values[row * stride + k]
	return out


## Материалы строками по 5 текселей RGBAF: ровно 20 чисел на материал.
@warning_ignore("integer_division")
static func _material_texture(values: PackedFloat32Array) -> ImageTexture:
	var count := values.size() / MATERIAL_FLOATS
	var texels := PackedFloat32Array()
	texels.resize(maxi(1, count) * 20)
	for k in values.size():
		texels[k] = values[k]
	var image := Image.create_from_data(
		5, maxi(1, count), false, Image.FORMAT_RGBAF, texels.to_byte_array()
	)
	return ImageTexture.create_from_image(image)


## Число материала [param index] (с 1) по смещению [param offset] раскладки.
func material_value(index: int, offset: int) -> float:
	if index <= 0:
		return 0.0
	return materials[(index - 1) * MATERIAL_FLOATS + offset]


## Читает файл `.bytefall` по пути. В экспортированной игре сырых файлов нет:
## там анимация приходит импортированным ресурсом.
static func load_file(path: String) -> BytefallAnimation:
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty():
		push_error("Bytefall: не удалось прочитать %s" % path)
		return null
	return from_bytes(bytes)
