import type { Animation } from '../../../core/animation';
import { fitThumbnail } from '../../../core/thumbnail';
import { spriteTiming } from '../../../core/timeline';
import type { GlyphAtlas } from '../../../render/font/GlyphAtlas';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { THUMB_HEIGHT, THUMB_MAX_WIDTH } from '../../thumbnails/thumbnailCache';
import { useFrameThumbnails } from '../../thumbnails/useFrameThumbnails';
import { timeToPx } from '../../timeline/timelineMath';
import { PixelCanvas } from '../../ui';

interface Props {
  readonly atlas: GlyphAtlas;
  readonly scale: number;
  readonly span: number;
}

/** Больше повторов кадров по кругу не рисуем: дальше они всё равно сливаются в полосу. */
const MAX_BLOCKS = 600;

/**
 * Показы кадров до конца видимого времени: первый круг и его повторы. Один кадр — один блок на
 * всё время: повторять один и тот же рисунок незачем.
 */
function spriteBlocks(anim: Animation, span: number) {
  const { starts, length } = spriteTiming(anim.frames);
  if (anim.frames.length === 1) return [{ index: 0, start: 0, loop: 0, width: span }];
  const blocks: { index: number; start: number; loop: number; width?: number }[] = [];
  for (let loop = 0; loop * length < span && blocks.length < MAX_BLOCKS; loop++) {
    starts.forEach((start, index) => blocks.push({ index, start: loop * length + start, loop }));
  }
  return blocks;
}

/**
 * Спрайт-трек: кадры лежат на шкале времени, ширина — их длительность. Повторы после первого
 * круга бледнее: это те же кадры, идущие по кругу. Щелчок ставит указатель на начало кадра.
 */
export function SpriteLane({ atlas, scale, span }: Props) {
  const animation = useDocumentStore((s) => s.animation);
  const frameIndex = useDocumentStore((s) => s.frameIndex);
  const thumbnails = useFrameThumbnails(atlas);
  const thumb = fitThumbnail(animation.width, animation.height, THUMB_MAX_WIDTH, THUMB_HEIGHT);

  const select = (start: number): void => {
    const editor = useEditorStore.getState();
    if (editor.isPlaying) editor.setPlaying(false);
    useDocumentStore.getState().setTime(start);
  };

  return (
    <div className="tl-lane tl-lane--sprite">
      {spriteBlocks(animation, span).map(({ index, start, loop, width: time }) => {
        const frame = animation.frames[index];
        const width = (time ?? frame.duration) * scale;
        const classes = [
          'tl-frame',
          index === frameIndex ? 'is-active' : '',
          loop > 0 ? 'is-repeat' : '',
        ].join(' ');
        return (
          <button
            key={`${loop}:${frame.id}`}
            type="button"
            className={classes}
            style={{ left: timeToPx(start, scale), width }}
            aria-label={`Кадр ${index + 1}`}
            title={`Кадр ${index + 1}: ${frame.duration} мс`}
            onClick={() => select(start)}
          >
            {width >= thumb.width + 6 && (
              <PixelCanvas
                image={thumbnails.get(frame.id)}
                width={thumb.width}
                height={thumb.height}
                className="frame-thumb"
              />
            )}
            <span className="tl-frame-num">{index + 1}</span>
          </button>
        );
      })}
    </div>
  );
}
