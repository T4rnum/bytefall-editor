import type { Animation } from '../../core/animation';
import { atlasGrid, packBytefall } from '../../core/bytefall';
import { type ComposedFrame, composeAt } from '../../core/frame';
import { safeFileName } from '../../core/filename';
import { type RuntimeFrame, mergeRepeats, runtimeFrame, usedGlyphs } from '../../core/runtime';
import { exportSamples, hasMotion, sceneDuration } from '../../core/timeline';
import { JobCancelled, type JobContext } from '../jobs/job';
import { GIF_MAX_FPS, type RenderedFrame, gifSamples, gifTimings } from '../io/animationExport';
import { canvasPng } from '../io/archives';
import { saveBlobFile } from '../io/files';
import { encodeOffThread } from '../workers/encoder';
import { useDocumentStore } from './documentStore';
import { cancelJobAction, runJob } from './jobStore';
import { errorMessage, notify } from './notifyStore';
import { getActiveView } from './viewActions';

/**
 * Экспорт анимации — долгая работа: кадры рисуются на GPU по одному, между ними редактор
 * отзывается, прогресс и «Отмена» — в строке состояния. Кодирование уходит в воркер.
 */

interface Moment {
  readonly time: number;
  readonly delay: number;
}

/**
 * Рендерит моменты сцены без служебной графики в пиксели. Кадр в момент считает `composeAt` —
 * тот же `evaluate` и тот же композитор, что у экрана, поэтому экспорт совпадает с ним.
 */
async function renderMoments(
  animation: Animation,
  moments: readonly Moment[],
  scale: number,
  job: JobContext,
): Promise<RenderedFrame[]> {
  const view = getActiveView();
  if (!view) throw new Error('холст ещё не готов');
  let previous: ComposedFrame | null = null;
  const frames: RenderedFrame[] = [];
  for (const [i, { time, delay }] of moments.entries()) {
    await job.step(i, moments.length);
    const frame: ComposedFrame = composeAt(animation, time, previous);
    previous = frame;
    frames.push({ ...view.renderPixels(frame, scale), delay });
  }
  await job.step(moments.length, moments.length);
  return frames;
}

/**
 * Работа с сохранением в файл. Диалог сохранения открывается сразу — браузер пускает его только
 * по свежему щелчку, — а работа идёт, пока пользователь выбирает место. Отказался от диалога —
 * работа отменяется.
 */
async function exportToFile(
  label: string,
  file: { name: string; extension: string; description: string; type: string },
  done: string,
  work: (job: JobContext) => Promise<Uint8Array>,
): Promise<void> {
  const result = runJob(label, work);
  const blob = result.then((bytes) => {
    if (!bytes) throw new JobCancelled();
    return new Blob([bytes.slice()], { type: file.type });
  });
  try {
    if (await saveBlobFile(blob, file.name, file.extension, file.description)) notify(done);
    else cancelJobAction();
  } catch (error) {
    // Отмену и ошибку работы уже объявила сама работа.
    if (!(error instanceof JobCancelled))
      notify(`Не удалось сохранить: ${errorMessage(error)}`, 'error');
  }
}

export async function exportGifAction(scale: number): Promise<void> {
  const { animation } = useDocumentStore.getState();
  const capped = hasMotion(animation) && animation.fps > GIF_MAX_FPS;
  await exportToFile(
    'Экспорт GIF',
    {
      name: `${safeFileName(animation.name)}.gif`,
      extension: '.gif',
      description: 'Анимация GIF',
      type: 'image/gif',
    },
    capped
      ? `GIF сохранён с частотой ${GIF_MAX_FPS} к/с: чаще формат GIF кадры не показывает`
      : 'GIF сохранён',
    async (job) => {
      const moments = gifTimings(gifSamples(animation), sceneDuration(animation));
      const frames = await renderMoments(animation, moments, scale, job);
      const transparent = animation.background === null;
      return encodeOffThread({ kind: 'gif', frames, transparent }, job.signal);
    },
  );
}

/** Листы спрайтов PNG с атласами JSON в формате Aseprite — для движков и импортёров. */
export async function exportSpriteSheetAction(scale: number): Promise<void> {
  const { animation } = useDocumentStore.getState();
  const name = safeFileName(animation.name);
  await exportToFile(
    'Экспорт листа спрайтов',
    {
      name: `${name}-sheet.zip`,
      extension: '.zip',
      description: 'Архив ZIP',
      type: 'application/zip',
    },
    'Лист спрайтов сохранён',
    async (job) => {
      const frames = await renderMoments(animation, exportSamples(animation), scale, job);
      return encodeOffThread({ kind: 'sheet', frames, name }, job.signal);
    },
  );
}

/** Каждый момент экспорта отдельным PNG, тайминг — в JSON рядом. */
export async function exportFramesAction(scale: number): Promise<void> {
  const { animation } = useDocumentStore.getState();
  const name = safeFileName(animation.name);
  await exportToFile(
    'Экспорт кадров',
    {
      name: `${name}-frames.zip`,
      extension: '.zip',
      description: 'Архив ZIP',
      type: 'application/zip',
    },
    'Кадры сохранены',
    async (job) => {
      const frames = await renderMoments(animation, exportSamples(animation), scale, job);
      return encodeOffThread({ kind: 'frames', frames, name, fps: animation.fps }, job.signal);
    },
  );
}

/**
 * Файл `.bytefall` для рантаймов Godot и Unity: атлас символов и поток символов на каждый момент
 * экспорта. Кадры считает тот же `composeAt`, что и экран; огонь и узлы объектов уже в них.
 */
export async function exportBytefallAction(): Promise<void> {
  const { animation } = useDocumentStore.getState();
  const name = safeFileName(animation.name);
  await exportToFile(
    'Экспорт для движка',
    {
      name: `${name}.bytefall`,
      extension: '.bytefall',
      description: 'Анимация для движка',
      type: 'application/octet-stream',
    },
    'Файл для движка сохранён',
    async (job) => {
      const view = getActiveView();
      if (!view) throw new Error('холст ещё не готов');
      const samples = exportSamples(animation);
      let previous: ComposedFrame | null = null;
      const moments: RuntimeFrame[] = [];
      for (const [i, { time, delay }] of samples.entries()) {
        await job.step(i, samples.length);
        const frame: ComposedFrame = composeAt(animation, time, previous);
        previous = frame;
        moments.push(runtimeFrame(frame, delay));
      }
      const frames = mergeRepeats(moments);
      const glyphs = usedGlyphs(frames);
      const cell = view.atlas.cellWidth;
      const grid = atlasGrid(glyphs.length, cell);
      const atlasPng = await canvasPng(view.atlas.sheet(glyphs, grid.columns));
      const header = {
        name: animation.name,
        width: animation.width,
        height: animation.height,
        background: animation.background,
        fps: animation.fps,
        atlas: { cell, ...grid, glyphs },
      };
      return packBytefall({ header, atlasPng, frames });
    },
  );
}
