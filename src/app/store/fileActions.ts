import { type Animation, createAnimation, frameDocument } from '../../core/animation';
import { composite } from '../../core/compositor';
import { type CreateDocumentOptions, createDocument } from '../../core/document';
import { hasActiveEffects } from '../../core/effects';
import { safeFileName } from '../../core/filename';
import { bufferToText } from '../../core/text';
import { type RenderedFrame, buildSpriteSheet, encodeGif } from '../io/animationExport';
import { openDocumentFile, saveBlobFile, saveDocumentFile } from '../io/files';
import { useDocumentStore } from './documentStore';
import { errorMessage, notify } from './notifyStore';
import { getActiveView } from './viewActions';

function confirmDiscard(): boolean {
  if (!useDocumentStore.getState().dirty) return true;
  return window.confirm('Есть несохранённые изменения. Продолжить без сохранения?');
}

export function newDocumentAction(options: CreateDocumentOptions): void {
  if (!confirmDiscard()) return;
  try {
    useDocumentStore.getState().replaceAnimation(createAnimation(createDocument(options)));
  } catch (error) {
    notify(errorMessage(error), 'error');
  }
}

export async function openDocumentAction(): Promise<void> {
  if (!confirmDiscard()) return;
  const before = useDocumentStore.getState().animation;
  try {
    const opened = await openDocumentFile();
    if (!opened) return;
    // Пока был открыт диалог, документ могли изменить: спрашиваем ещё раз.
    if (useDocumentStore.getState().animation !== before && !confirmDiscard()) return;
    useDocumentStore.getState().replaceAnimation(opened.animation, opened.file);
    notify(`Открыт ${opened.file.name}`);
  } catch (error) {
    notify(`Не удалось открыть: ${errorMessage(error)}`, 'error');
  }
}

export async function saveDocumentAction(saveAs = false): Promise<void> {
  const { animation, file, markSaved } = useDocumentStore.getState();
  try {
    const saved = await saveDocumentFile(animation, file, saveAs);
    if (!saved) return;
    markSaved(saved, animation);
    notify(`Сохранено: ${saved.name}`);
  } catch (error) {
    notify(`Не удалось сохранить: ${errorMessage(error)}`, 'error');
  }
}

export async function exportPngAction(pixelsPerCell: number): Promise<void> {
  const view = getActiveView();
  if (!view) return;
  const { doc } = useDocumentStore.getState();
  try {
    const blob = await view.exportPng(pixelsPerCell);
    if (await saveBlobFile(blob, `${safeFileName(doc.name)}.png`, '.png', 'Изображение PNG')) {
      notify('PNG сохранён');
    }
  } catch (error) {
    notify(`Не удалось экспортировать: ${errorMessage(error)}`, 'error');
  }
}

export async function exportTextAction(): Promise<void> {
  const { doc } = useDocumentStore.getState();
  try {
    const text = bufferToText(composite(doc));
    // Тип без параметров: диалог сохранения отвергает MIME с charset.
    const blob = new Blob([text], { type: 'text/plain' });
    if (await saveBlobFile(blob, `${safeFileName(doc.name)}.txt`, '.txt', 'Текст')) {
      notify('Текст сохранён');
    }
  } catch (error) {
    notify(`Не удалось экспортировать: ${errorMessage(error)}`, 'error');
  }
}

const EFFECT_LOOP_SAMPLES = 20;
const EFFECT_LOOP_STEP = 100;

interface ExportSample {
  readonly frameIndex: number;
  readonly time: number;
  readonly delay: number;
}

/**
 * Что рендерить: каждый кадр в момент его начала. Один кадр с эффектами превращается
 * в короткую петлю, иначе эффекты в GIF не увидеть.
 */
function exportSamples(animation: Animation): ExportSample[] {
  const hasEffects = animation.frames.some((f) =>
    f.layers.some((l) => hasActiveEffects(l.effects)),
  );
  if (animation.frames.length === 1 && hasEffects) {
    return Array.from({ length: EFFECT_LOOP_SAMPLES }, (_, i) => ({
      frameIndex: 0,
      time: i * EFFECT_LOOP_STEP,
      delay: EFFECT_LOOP_STEP,
    }));
  }
  let time = 0;
  return animation.frames.map((frame, frameIndex) => {
    const sample = { frameIndex, time, delay: frame.duration };
    time += frame.duration;
    return sample;
  });
}

/** Рендерит каждый кадр без служебной графики в пиксели, эффекты берутся на момент кадра. */
function renderFrames(pixelsPerCell: number): RenderedFrame[] {
  const view = getActiveView();
  if (!view) throw new Error('холст ещё не готов');
  const { animation } = useDocumentStore.getState();
  return exportSamples(animation).map((sample) => {
    const doc = frameDocument(animation, sample.frameIndex);
    const buffer = composite(doc, null, undefined, [], sample.time);
    return { ...view.renderPixels(buffer, pixelsPerCell), delay: sample.delay };
  });
}

export async function exportGifAction(pixelsPerCell: number): Promise<void> {
  const { animation } = useDocumentStore.getState();
  try {
    const bytes = encodeGif(renderFrames(pixelsPerCell), animation.background === null);
    const blob = new Blob([bytes.slice()], { type: 'image/gif' });
    if (await saveBlobFile(blob, `${safeFileName(animation.name)}.gif`, '.gif', 'Анимация GIF')) {
      notify('GIF сохранён');
    }
  } catch (error) {
    notify(`Не удалось экспортировать: ${errorMessage(error)}`, 'error');
  }
}

export async function exportSpriteSheetAction(pixelsPerCell: number): Promise<void> {
  const { animation } = useDocumentStore.getState();
  try {
    const blob = await buildSpriteSheet(renderFrames(pixelsPerCell));
    const name = `${safeFileName(animation.name)}-sheet.png`;
    if (await saveBlobFile(blob, name, '.png', 'Лист спрайтов PNG'))
      notify('Лист спрайтов сохранён');
  } catch (error) {
    notify(`Не удалось экспортировать: ${errorMessage(error)}`, 'error');
  }
}
