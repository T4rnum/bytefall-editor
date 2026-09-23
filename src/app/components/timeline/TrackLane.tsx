import type { Track } from '../../../core/tracks';
import { trackKey } from '../../../core/tracks';
import { useEditorStore } from '../../store/editorStore';

interface Props {
  readonly track: Track | undefined;
  readonly scale: number;
}

/**
 * Ключи одного свойства. Между ключами — отрезок: сплошной — значение идёт равномерно,
 * с утолщением к краям — по кривой, без отрезка — держится до следующего ключа скачком.
 * Ключ несёт `data-track` и `data-time`: по ним жесты таймлайна узнают, что под указателем.
 */
export function TrackLane({ track, scale }: Props) {
  const selected = useEditorStore((s) => s.selectedKeys);
  if (!track) return <div className="tl-lane tl-lane--track" />;
  const key = trackKey(track);
  const isSelected = (time: number): boolean =>
    selected.some((r) => r.track === key && r.time === time);
  const { keys } = track;
  return (
    <div className="tl-lane tl-lane--track">
      {keys
        .slice(0, -1)
        .map((k, i) =>
          k.interpolation === 'step' ? null : (
            <span
              key={`seg${k.time}`}
              className={`tl-seg tl-seg--${k.interpolation}`}
              style={{ left: k.time * scale, width: (keys[i + 1].time - k.time) * scale }}
            />
          ),
        )}
      {keys.map((k) => (
        <span
          key={k.time}
          className={`tl-key${isSelected(k.time) ? ' is-selected' : ''}`}
          style={{ left: k.time * scale }}
          data-track={key}
          data-time={k.time}
          title={`${k.time / 1000} с`}
        />
      ))}
    </div>
  );
}
