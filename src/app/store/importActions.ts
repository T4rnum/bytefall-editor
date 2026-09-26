import { evaluate } from '../../core/evaluate';
import { type ConvertedImage, addImageLayer } from '../../core/imageLayer';
import { formatPalette, parseAse, parsePalette } from '../../core/paletteFile';
import { decodeImage, imageName } from '../io/image';
import { openImageFile, openPaletteFile } from '../io/files';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { errorMessage, notify } from './notifyStore';
import { useUiStore } from './uiStore';
import { fitViewAction } from './viewActions';

/** Открывает диалог импорта с картинкой из файла: и для выбора в диалоге, и для перетаскивания. */
export async function importImageFileAction(file: File): Promise<void> {
  try {
    const image = await decodeImage(file);
    useUiStore.getState().setImageImport({ name: imageName(file.name), image });
  } catch (error) {
    notify(`Не удалось прочитать картинку: ${errorMessage(error)}`, 'error');
  }
}

/** Ctrl+I: выбрать картинку и открыть диалог импорта. */
export async function importImageAction(): Promise<void> {
  try {
    const file = await openImageFile();
    if (file) await importImageFileAction(file);
  } catch (error) {
    notify(`Не удалось открыть картинку: ${errorMessage(error)}`, 'error');
  }
}

/**
 * Своя палитра импорта из файла: цвета строкой. null при отмене и при ошибке — о ней скажет
 * уведомление, а прежняя палитра останется.
 */
export async function loadPaletteFileAction(): Promise<string | null> {
  try {
    const file = await openPaletteFile();
    if (!file) return null;
    // ASE — двоичный файл Adobe, остальные форматы — текст.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ase = parseAse(bytes);
    const colors = ase.length > 0 ? ase : parsePalette(new TextDecoder().decode(bytes));
    if (colors.length > 0) return formatPalette(colors);
    notify(`В файле ${file.name} не нашлось цветов`, 'error');
  } catch (error) {
    notify(`Не удалось открыть палитру: ${errorMessage(error)}`, 'error');
  }
  return null;
}

/**
 * Предпросмотр прямо на холсте: черновик документа уже с новым слоем. Так видно ровно то, что
 * будет вставлено, настоящим рендером, а не приблизительной картинкой в окне.
 */
export function previewImageImport(converted: ConvertedImage, fitCanvas: boolean): void {
  const { animation, frameIndex, time } = useDocumentStore.getState();
  try {
    const next = addImageLayer(animation, frameIndex, converted, fitCanvas).animation;
    // Черновик — та же сцена в тот же момент: анимированные объекты стоят там, где их видно.
    useEditorStore.getState().setDraft(evaluate(next, time));
  } catch (error) {
    notify(errorMessage(error), 'error');
  }
}

export function closeImageImport(): void {
  useEditorStore.getState().setDraft(null);
  useUiStore.getState().setImageImport(null);
}

/** Вставляет картинку новым слоем одной записью истории и делает этот слой активным. */
export function applyImageImportAction(converted: ConvertedImage, fitCanvas: boolean): void {
  const state = useDocumentStore.getState();
  try {
    const { animation, layerId } = addImageLayer(
      state.animation,
      state.frameIndex,
      converted,
      fitCanvas,
    );
    closeImageImport();
    state.commitAnimation('Import image', animation);
    useDocumentStore.getState().setActiveLayer(layerId);
    if (fitCanvas) fitViewAction();
  } catch (error) {
    notify(errorMessage(error), 'error');
  }
}
