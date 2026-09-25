import { RotateCcw } from 'lucide-react';
import { DEFAULT_POST, type PostSettings } from '../../render/post';
import { useEditorStore } from '../store/editorStore';
import { Button, Field, NumberField, Panel, resetTo } from '../ui';

const CONTROLS: readonly {
  readonly key: keyof PostSettings;
  readonly label: string;
  readonly max: number;
}[] = [
  { key: 'bloom', label: 'Свечение', max: 2 },
  { key: 'scanlines', label: 'Строки развёртки', max: 1 },
  { key: 'vignette', label: 'Виньетка', max: 1 },
];

/** Постэффекты уровня пикселей. Настройка сессии: применяется к экрану и к экспорту. */
export function LookPanel() {
  const post = useEditorStore((s) => s.post);
  const setPost = useEditorStore((s) => s.setPost);

  return (
    <Panel
      id="look"
      title="Постобработка"
      actions={
        <Button icon size="sm" label="Сбросить постобработку" onClick={() => setPost(DEFAULT_POST)}>
          <RotateCcw size={13} />
        </Button>
      }
    >
      {CONTROLS.map(({ key, label, max }) => (
        <Field
          key={key}
          label={label}
          onReset={resetTo(post[key], DEFAULT_POST[key], (v) => setPost({ [key]: v }))}
        >
          <NumberField
            value={post[key]}
            min={0}
            max={max}
            step={0.05}
            onChange={(value) => setPost({ [key]: value })}
            width="var(--field-w)"
          />
        </Field>
      ))}
    </Panel>
  );
}
