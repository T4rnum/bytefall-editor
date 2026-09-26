@tool
class_name BytefallAnimation
extends Resource
## Анимация из Bytefall Editor: атлас символов и поток символов на каждый кадр.
##
## Файл `.bytefall` превращается в этот ресурс при импорте, в игре его играет
## [BytefallPlayer]. Раскладка файла описана в `src/core/bytefall.ts` редактора.

const MAGIC := "BYTEFALL"
const VERSION := 1
const GLYPH_BYTES := 32

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
	if bytes.decode_u16(8) > VERSION:
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
	var total := 0
	for frame in header.frames:
		anim.durations.append(float(frame.duration))
		anim.offsets.append(total)
		total += int(frame.count)
	anim.offsets.append(total)
	if at + total * GLYPH_BYTES > bytes.size():
		push_error("Bytefall: файл оборван")
		return null
	anim.data = bytes.slice(at, at + total * GLYPH_BYTES)
	return anim


## Читает файл `.bytefall` по пути. В экспортированной игре сырых файлов нет:
## там анимация приходит импортированным ресурсом.
static func load_file(path: String) -> BytefallAnimation:
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty():
		push_error("Bytefall: не удалось прочитать %s" % path)
		return null
	return from_bytes(bytes)
