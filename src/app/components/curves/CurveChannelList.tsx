import type { CurveChannel } from '../../curves/curveChannels';

interface Props {
  readonly channels: readonly CurveChannel[];
  readonly hidden: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
}

/** Каналы по владельцам: щелчок прячет кривую или показывает обратно, как глаз в Blender. */
export function CurveChannelList({ channels, hidden, onToggle }: Props) {
  const owners: { owner: string; channels: CurveChannel[] }[] = [];
  for (const c of channels) {
    const last = owners.at(-1);
    if (last?.owner === c.owner) last.channels.push(c);
    else owners.push({ owner: c.owner, channels: [c] });
  }
  return (
    <div className="curve-channels" aria-label="Каналы кривых">
      {owners.map((o, i) => (
        <div key={`${o.owner}:${i}`} className="curve-owner">
          <div className="curve-owner-name">{o.owner}</div>
          {o.channels.map((c) => {
            const off = hidden.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`curve-channel${off ? ' is-hidden' : ''}`}
                aria-pressed={!off}
                title={off ? 'Показать кривую' : 'Спрятать кривую'}
                onClick={() => onToggle(c.id)}
              >
                <span className="curve-swatch" style={{ background: c.color }} />
                {c.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
