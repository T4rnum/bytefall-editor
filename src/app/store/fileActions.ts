import { type Animation, createAnimation } from '../../core/animation';
import { composite } from '../../core/compositor';
import { type ComposedFrame, composeAt } from '../../core/frame';
import { type CreateDocumentOptions, createDocument } from '../../core/document';
import { safeFileName } from '../../core/filename';
import { exportSamples, hasMotion, sceneDuration } from '../../core/timeline';
import { bufferToText } from '../../core/text';
import {
  GIF_MAX_FPS,
  type RenderedFrame,
  encodeGif,
  gifSamples,
  gifTimings,
} from '../io/animationExport';
import { frameArchive, sheetArchive } from '../io/archives';
import { openDocumentFile, readDocumentFile, saveBlobFile, saveDocumentFile } from '../io/files';
import type { SourceKind } from '../io/readDocument';
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

const OPENED_MESSAGES: Readonly<Record<SourceKind, (name: string) => string>> = {
  bytefall: (name) => `Открыт ${name}`,
  rexpaint: (name) => `Импортирован ${name} из REXPaint. Сохраните его как документ Bytefall.`,
  prototype: (name) => `Импортирован ${name} из первого прототипа. Сохраните как новый документ.`,
};

export async function openDocumentAction(): Promise<void> {
  if (!confirmDiscard()) return;
  const before = useDocumentStore.getState().animation;
  try {
    const opened = await openDocumentFile();
    if (!opened) return;
    // Пока был открыт диалог, документ могли изменить: спрашиваем ещё раз.
    if (useDocumentStore.getState().animation !== before && !confirmDiscard()) return;
    useDocumentStore.getState().replaceAnimation(opened.animation, opened.file);
    notify(OPENED_MESSAGES[opened.kind](opened.sourceName));
  } catch (error) {
    notify(`Не удалось открыть: ${errorMessage(error)}`, 'error');
  }
}

/** Документ, перетащенный в окно: .bp.json, .xp из REXPaint или файл первого прототипа. */
export async function openDroppedDocumentAction(file: File): Promise<void> {
  if (!confirmDiscard()) return;
  try {
    const opened = await readDocumentFile(file);
    useDocumentStore.getState().replaceAnimation(opened.animation, opened.file);
    notify(OPENED_MESSAGES[opened.kind](opened.sourceName));
  } catch (error) {
    notify(`Не удалось открыть ${file.name}: ${errorMessage(error)}`, 'error');
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

/** Текст сцены в момент указателя: эффекты — на тот же момент, что и треки. */
export async function exportTextAction(): Promise<void> {
  const { doc, time } = useDocumentStore.getState();
  try {
    const text = bufferToText(composite(doc, null, undefined, [], time));
    // Тип без параметров: диалог сохранения отвергает MIME с charset.
    const blob = new Blob([text], { type: 'text/plain' });
    if (await saveBlobFile(blob, `${safeFileName(doc.name)}.txt`, '.txt', 'Текст')) {
      notify('Текст сохранён');
    }
  } catch (error) {
    notify(`Не удалось экспортировать: ${errorMessage(error)}`, 'error');
  }
}

interface Moment {
  readonly time: number;
  readonly delay: number;
}

/**
 * Рендерит моменты сцены без служебной графики в пиксели. Кадр в момент считает `composeAt`
 * — тот же `evaluate` и тот же композитор, что у экрана, поэтому экспорт совпадает с ним.
 */
function renderMoments(
  animation: Animation,
  moments: readonly Moment[],
  ppc: number,
): RenderedFrame[] {
  const view = getActiveView();
  if (!view) throw new Error('холст ещё не готов');
  let previous: ComposedFrame | null = null;
  return moments.map(({ time, delay }) => {
    const frame: ComposedFrame = composeAt(animation, time, previous);
    previous = frame;
    return { ...view.renderPixels(frame, ppc), delay };
  });
}

export async function exportGifAction(pixelsPerCell: number): Promise<void> {
  const { animation } = useDocumentStore.getState();
  try {
    const moments = gifTimings(gifSamples(animation), sceneDuration(animation));
    const frames = renderMoments(animation, moments, pixelsPerCell);
    const bytes = encodeGif(frames, animation.background === null);
    const blob = new Blob([bytes.slice()], { type: 'image/gif' });
    if (await saveBlobFile(blob, `${safeFileName(animation.name)}.gif`, '.gif', 'Анимация GIF')) {
      const capped = hasMotion(animation) && animation.fps > GIF_MAX_FPS;
      notify(
        capped
          ? `GIF сохранён с частотой ${GIF_MAX_FPS} к/с: чаще формат GIF кадры не показывает`
          : 'GIF сохранён',
      );
    }
  } catch (error) {
    notify(`Не удалось экспортировать: ${errorMessage(error)}`, 'error');
  }
}

/** Архив ZIP из экспорта: листы с атласами или кадры с таймингом. */
async function saveArchive(bytes: Uint8Array, name: string, done: string): Promise<void> {
  const blob = new Blob([bytes.slice()], { type: 'application/zip' });
  if (await saveBlobFile(blob, name, '.zip', 'Архив ZIP')) notify(done);
}

/** Листы спрайтов PNG с атласами JSON в формате Aseprite — для движков и импортёров. */
export async function exportSpriteSheetAction(pixelsPerCell: number): Promise<void> {
  const { animation } = useDocumentStore.getState();
  const name = safeFileName(animation.name);
  try {
    const frames = renderMoments(animation, exportSamples(animation), pixelsPerCell);
    await saveArchive(
      await sheetArchive(frames, name),
      `${name}-sheet.zip`,
      'Лист спрайтов сохранён',
    );
  } catch (error) {
    notify(`Не удалось экспортировать: ${errorMessage(error)}`, 'error');
  }
}

/** Каждый момент экспорта отдельным PNG, тайминг — в JSON рядом. */
export async function exportFramesAction(pixelsPerCell: number): Promise<void> {
  const { animation } = useDocumentStore.getState();
  const name = safeFileName(animation.name);
  try {
    const frames = renderMoments(animation, exportSamples(animation), pixelsPerCell);
    const bytes = await frameArchive(frames, name, animation.fps);
    await saveArchive(bytes, `${name}-frames.zip`, 'Кадры сохранены');
  } catch (error) {
    notify(`Не удалось экспортировать: ${errorMessage(error)}`, 'error');
  }
}
