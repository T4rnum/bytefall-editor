import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Ghost,
  Maximize2,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRef } from 'react';
import { MAX_FRAME_DURATION, MIN_FRAME_DURATION } from '../../../core/animation';
import { FPS_PRESETS, MAX_SCENE_DURATION, MIN_SCENE_DURATION } from '../../../core/time';
import { sceneDuration } from '../../../core/timeline';
import { findTrack, keyIndexAt } from '../../../core/tracks';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import {
  addFrameAction,
  moveFrameAction,
  removeFrameAction,
  setFrameDurationAction,
  stepFrameAction,
  togglePlaybackAction,
} from '../../store/frameActions';
import {
  deleteSelectedKeysAction,
  keySelectedObjectAction,
  setKeysInterpolationAction,
} from '../../store/keyActions';
import { setFpsAction, setSceneDurationAction } from '../../store/timeActions';
import { Button, KeyButton, NumberField, Select } from '../../ui';
import { EASES, selectedEase } from '../../timeline/eases';
import { formatSeconds } from '../../timeline/timelineMath';

/** Характер выделенных ключей; перерисовка — когда меняются ключи или выделение. */
function useSelectedEase(): string {
  const tracks = useDocumentStore((s) => s.animation.tracks);
  const refs = useEditorStore((s) => s.selectedKeys);
  return selectedEase(tracks, refs);
}

function PlaybackControls() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const time = useDocumentStore((s) => s.time);
  const end = useDocumentStore((s) => sceneDuration(s.animation));
  const PlayIcon = isPlaying ? Pause : Play;
  return (
    <div className="timeline-group">
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
      <span className="timeline-time" title="Момент указателя и длина сцены">
        {formatSeconds(time)} / {formatSeconds(end)} с
      </span>
    </div>
  );
}

function KeyControls() {
  const selected = useEditorStore((s) => s.selectedKeys.length);
  const ease = useSelectedEase();
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId);
  const transformKeyed = useDocumentStore((s) => {
    if (!selectedObjectId) return false;
    const track = findTrack(s.animation.tracks, {
      node: 'object',
      id: selectedObjectId,
      property: 'position',
    });
    return track !== undefined && keyIndexAt(track.keys, s.time) !== -1;
  });
  return (
    <div className="timeline-group">
      <KeyButton
        state={transformKeyed ? 'key' : 'none'}
        subject="положение, поворот и масштаб выбранного объекта (K)"
        disabled={!selectedObjectId}
        onClick={keySelectedObjectAction}
      />
      <Select
        value={ease}
        options={[
          { value: '', label: selected ? 'По-разному' : 'Ключи не выделены', disabled: true },
          ...EASES,
        ]}
        size="sm"
        disabled={selected === 0}
        ariaLabel="Как значение идёт от выделенных ключей к следующим"
        title="Как значение идёт от выделенных ключей к следующим"
        onChange={(value) => {
          const choice = EASES.find((e) => e.value === value);
          if (choice) setKeysInterpolationAction(choice.interpolation, choice.easing);
        }}
      />
      <Button
        icon
        size="sm"
        variant="danger"
        label="Удалить выделенные ключи"
        hotkey="Delete"
        disabled={selected === 0}
        onClick={() => void deleteSelectedKeysAction()}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

function SceneControls({ onFit }: { readonly onFit: () => void }) {
  const animation = useDocumentStore((s) => s.animation);
  const onionSkin = useEditorStore((s) => s.onionSkin);
  const effectsLive = useEditorStore((s) => s.effectsLive);
  const gesture = useRef(0);
  const presets = FPS_PRESETS.includes(animation.fps)
    ? FPS_PRESETS
    : [...FPS_PRESETS, animation.fps];
  const auto = animation.duration === null;
  const length = (seconds: number): void =>
    setSceneDurationAction(seconds * 1000, `scene-length:${gesture.current}`);
  return (
    <div className="timeline-group">
      <Select
        value={String(animation.fps)}
        options={[...presets]
          .sort((a, b) => a - b)
          .map((fps) => ({ value: String(fps), label: `${fps} к/с` }))}
        size="sm"
        ariaLabel="Частота кадров сцены"
        title="С этой частотой проигрывается и экспортируется движение"
        onChange={(value) => setFpsAction(Number(value))}
      />
      <NumberField
        value={Number((sceneDuration(animation) / 1000).toFixed(3))}
        min={MIN_SCENE_DURATION / 1000}
        max={MAX_SCENE_DURATION / 1000}
        step={0.1}
        suffix=" с"
        title="Длина сцены: столько идёт петля и экспорт"
        onChange={length}
        onCommit={(value) => {
          length(value);
          gesture.current += 1;
        }}
      />
      <Button
        size="sm"
        active={auto}
        label="Длина по кадрам и ключам, а у сцены с движением — не меньше двух секунд"
        onClick={() =>
          auto ? setSceneDurationAction(sceneDuration(animation)) : setSceneDurationAction(null)
        }
      >
        Авто
      </Button>
      <Button
        icon
        label="Калька: показать соседние кадры"
        active={onionSkin}
        onClick={() => useEditorStore.getState().setOnionSkin(!onionSkin)}
      >
        <Ghost size={16} />
      </Button>
      <Button
        icon
        label="Живые эффекты: крутить эффекты, пока сцена стоит"
        active={effectsLive}
        onClick={() => useEditorStore.getState().setEffectsLive(!effectsLive)}
      >
        <Sparkles size={16} />
      </Button>
      <Button icon label="Вписать время в таймлайн" onClick={onFit}>
        <Maximize2 size={16} />
      </Button>
    </div>
  );
}

function FrameControls() {
  const count = useDocumentStore((s) => s.animation.frames.length);
  const frameIndex = useDocumentStore((s) => s.frameIndex);
  const duration = useDocumentStore((s) => s.animation.frames[s.frameIndex].duration);
  return (
    <div className="timeline-group">
      <span className="dim">
        Кадр {frameIndex + 1}/{count}
      </span>
      <Button icon size="sm" label="Новый пустой кадр" onClick={() => addFrameAction('empty')}>
        <Plus size={14} />
      </Button>
      <Button icon size="sm" label="Дублировать кадр" onClick={() => addFrameAction('duplicate')}>
        <Copy size={14} />
      </Button>
      <Button icon size="sm" label="Сдвинуть кадр влево" onClick={() => moveFrameAction(-1)}>
        <ChevronLeft size={14} />
      </Button>
      <Button icon size="sm" label="Сдвинуть кадр вправо" onClick={() => moveFrameAction(1)}>
        <ChevronRight size={14} />
      </Button>
      <Button
        icon
        size="sm"
        variant="danger"
        label="Удалить кадр"
        disabled={count <= 1}
        onClick={removeFrameAction}
      >
        <Trash2 size={14} />
      </Button>
      <NumberField
        value={duration}
        min={MIN_FRAME_DURATION}
        max={MAX_FRAME_DURATION}
        step={10}
        suffix=" мс"
        title="Длительность кадра. Тяни, чтобы менять, щёлкни для ввода"
        onChange={setFrameDurationAction}
      />
    </div>
  );
}

/** Управление таймлайном: проигрывание, ключи, сцена и кадры спрайт-трека. */
export function TimelineToolbar({ onFit }: { readonly onFit: () => void }) {
  return (
    <div className="timeline-toolbar">
      <PlaybackControls />
      <KeyControls />
      <SceneControls onFit={onFit} />
      <FrameControls />
    </div>
  );
}
