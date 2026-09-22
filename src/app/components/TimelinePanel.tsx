import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Ghost,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { MAX_FRAME_DURATION, MIN_FRAME_DURATION, animationDuration } from '../../core/animation';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import {
  addFrameAction,
  moveFrameAction,
  removeFrameAction,
  setFrameDurationAction,
  stepFrameAction,
  togglePlaybackAction,
} from '../store/frameActions';
import { Button, NumberField } from '../ui';

/** Полоса кадров: переход, проигрывание, onion skin, добавление и длительность. */
export function TimelinePanel() {
  const animation = useDocumentStore((s) => s.animation);
  const frameIndex = useDocumentStore((s) => s.frameIndex);
  const setFrameIndex = useDocumentStore((s) => s.setFrameIndex);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const onionSkin = useEditorStore((s) => s.onionSkin);
  const setOnionSkin = useEditorStore((s) => s.setOnionSkin);
  const effectsLive = useEditorStore((s) => s.effectsLive);
  const setEffectsLive = useEditorStore((s) => s.setEffectsLive);
  const frame = animation.frames[frameIndex];
  const PlayIcon = isPlaying ? Pause : Play;

  const selectFrame = (index: number): void => {
    setPlaying(false);
    setFrameIndex(index);
  };

  return (
    <section className="timeline" aria-label="Таймлайн">
      <div className="timeline-controls">
        <Button icon label="Предыдущий кадр" hotkey="," onClick={() => stepFrameAction(-1)}>
          <SkipBack size={16} />
        </Button>
        <Button
          icon
          label="Играть и пауза"
          hotkey="Enter"
          active={isPlaying}
          onClick={togglePlaybackAction}
        >
          <PlayIcon size={16} />
        </Button>
        <Button icon label="Следующий кадр" hotkey="." onClick={() => stepFrameAction(1)}>
          <SkipForward size={16} />
        </Button>
        <Button
          icon
          label="Калька: показать соседние кадры"
          active={onionSkin}
          onClick={() => setOnionSkin(!onionSkin)}
        >
          <Ghost size={16} />
        </Button>
        <Button
          icon
          label="Живые эффекты: анимировать эффекты слоёв прямо в редакторе"
          active={effectsLive}
          onClick={() => setEffectsLive(!effectsLive)}
        >
          <Sparkles size={16} />
        </Button>
      </div>

      <ol className="frame-strip">
        {animation.frames.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              className={`frame-chip${i === frameIndex ? ' is-active' : ''}`}
              title={`Кадр ${i + 1}: ${f.duration} мс`}
              onClick={() => selectFrame(i)}
            >
              {i + 1}
            </button>
          </li>
        ))}
      </ol>

      <div className="timeline-controls">
        <Button icon label="Новый пустой кадр" onClick={() => addFrameAction('empty')}>
          <Plus size={16} />
        </Button>
        <Button icon label="Дублировать кадр" onClick={() => addFrameAction('duplicate')}>
          <Copy size={16} />
        </Button>
        <Button icon label="Сдвинуть кадр влево" onClick={() => moveFrameAction(-1)}>
          <ChevronLeft size={16} />
        </Button>
        <Button icon label="Сдвинуть кадр вправо" onClick={() => moveFrameAction(1)}>
          <ChevronRight size={16} />
        </Button>
        <Button
          icon
          variant="danger"
          label="Удалить кадр"
          disabled={animation.frames.length <= 1}
          onClick={removeFrameAction}
        >
          <Trash2 size={16} />
        </Button>
        <NumberField
          value={frame.duration}
          min={MIN_FRAME_DURATION}
          max={MAX_FRAME_DURATION}
          step={10}
          suffix=" мс"
          title="Длительность кадра. Тяни, чтобы менять, щёлкни для ввода"
          onChange={(value) => {
            setPlaying(false);
            setFrameDurationAction(value);
          }}
        />
        <span className="dim">
          {frameIndex + 1}/{animation.frames.length} · {animationDuration(animation)} мс
        </span>
      </div>
    </section>
  );
}
