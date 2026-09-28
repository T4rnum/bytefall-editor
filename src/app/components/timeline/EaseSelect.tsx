import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { setKeysInterpolationAction } from '../../store/keyActions';
import { CUSTOM_EASE, EASES, selectedEase } from '../../timeline/eases';
import { Select } from '../../ui';

/**
 * Характер выделенных ключей: как значение идёт от них к следующим. Общий для таймлайна и
 * редактора кривых; свою кривую ставят ручками, здесь она видна как «Своя кривая».
 */
export function EaseSelect() {
  const tracks = useDocumentStore((s) => s.animation.tracks);
  const refs = useEditorStore((s) => s.selectedKeys);
  const ease = selectedEase(tracks, refs);
  return (
    <Select
      value={ease}
      options={[
        { value: '', label: refs.length ? 'По-разному' : 'Ключи не выделены', disabled: true },
        { value: CUSTOM_EASE, label: 'Своя кривая', disabled: true },
        ...EASES,
      ]}
      size="sm"
      disabled={refs.length === 0}
      ariaLabel="Как значение идёт от выделенных ключей к следующим"
      title="Как значение идёт от выделенных ключей к следующим. Свою кривую — ручками в кривых (G)"
      onChange={(value) => {
        const choice = EASES.find((e) => e.value === value);
        if (choice) setKeysInterpolationAction(choice.interpolation, choice.easing);
      }}
    />
  );
}
