import { DEFAULT_POST, type PostSettings } from '../../render/post';
import { useEditorStore } from '../store/editorStore';

const CONTROLS: readonly {
  readonly key: keyof PostSettings;
  readonly label: string;
  readonly max: number;
}[] = [
  { key: 'bloom', label: 'Glow', max: 2 },
  { key: 'scanlines', label: 'Scanlines', max: 1 },
  { key: 'vignette', label: 'Vignette', max: 1 },
];

/** Постэффекты уровня пикселей. Настройка сессии: применяется к экрану и к экспорту. */
export function LookPanel() {
  const post = useEditorStore((s) => s.post);
  const setPost = useEditorStore((s) => s.setPost);

  return (
    <section className="panel">
      <header className="panel-header">
        <span>Look</span>
        <div className="panel-actions">
          <button
            type="button"
            className="text-btn text-btn--small"
            onClick={() => setPost(DEFAULT_POST)}
          >
            reset
          </button>
        </div>
      </header>
      {CONTROLS.map((control) => (
        <label className="range-row" key={control.key}>
          <span>{control.label}</span>
          <input
            type="range"
            min={0}
            max={control.max}
            step={0.05}
            value={post[control.key]}
            onChange={(e) => setPost({ [control.key]: Number(e.target.value) })}
          />
          <span className="range-value">{post[control.key].toFixed(2)}</span>
        </label>
      ))}
    </section>
  );
}
