import { RotateCcw } from 'lucide-react';
import { DEFAULT_POST, type PostSettings } from '../../render/post';
import { useEditorStore } from '../store/editorStore';
import { Button, Panel, Slider } from '../ui';

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
      {CONTROLS.map((control) => (
        <Slider
          key={control.key}
          label={control.label}
          value={post[control.key]}
          min={0}
          max={control.max}
          step={0.05}
          onChange={(value) => setPost({ [control.key]: value })}
        />
      ))}
    </Panel>
  );
}
