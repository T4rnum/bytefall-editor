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

const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

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
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-controls">
        <button
          type="button"
          className="icon-btn"
          title="Previous frame (,)"
          onClick={() => stepFrameAction(-1)}
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn${isPlaying ? ' is-active' : ''}`}
          title="Play / pause (Enter)"
          onClick={togglePlaybackAction}
        >
          <PlayIcon size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Next frame (.)"
          onClick={() => stepFrameAction(1)}
        >
          <SkipForward size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn${onionSkin ? ' is-active' : ''}`}
          title="Onion skin: show neighbouring frames"
          aria-pressed={onionSkin}
          onClick={() => setOnionSkin(!onionSkin)}
        >
          <Ghost size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn${effectsLive ? ' is-active' : ''}`}
          title="Live effects: animate layer effects in the editor"
          aria-pressed={effectsLive}
          onClick={() => setEffectsLive(!effectsLive)}
        >
          <Sparkles size={16} />
        </button>
      </div>

      <ol className="frame-strip">
        {animation.frames.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              className={`frame-chip${i === frameIndex ? ' is-active' : ''}`}
              title={`Frame ${i + 1}: ${f.duration} ms`}
              onClick={() => selectFrame(i)}
            >
              {i + 1}
            </button>
          </li>
        ))}
      </ol>

      <div className="timeline-controls">
        <button
          type="button"
          className="icon-btn"
          title="New empty frame"
          onClick={() => addFrameAction('empty')}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Duplicate frame"
          onClick={() => addFrameAction('duplicate')}
        >
          <Copy size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Move frame left"
          onClick={() => moveFrameAction(-1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Move frame right"
          onClick={() => moveFrameAction(1)}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Delete frame"
          disabled={animation.frames.length <= 1}
          onClick={removeFrameAction}
        >
          <Trash2 size={16} />
        </button>
        <label className="inline-row">
          <input
            key={`${frame.id}:${frame.duration}`}
            className="num-input"
            type="number"
            min={MIN_FRAME_DURATION}
            max={MAX_FRAME_DURATION}
            step={10}
            defaultValue={frame.duration}
            aria-label="Frame duration, milliseconds"
            onFocus={() => setPlaying(false)}
            onBlur={(e) => setFrameDurationAction(Number(e.target.value))}
            onKeyDown={commitOnEnter}
          />
          <span>ms</span>
        </label>
        <span className="dim">
          {frameIndex + 1}/{animation.frames.length} · {animationDuration(animation)} ms
        </span>
      </div>
    </section>
  );
}
