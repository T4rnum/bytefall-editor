import { Maximize2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { curveChannels, curveTracks } from '../../curves/curveChannels';
import { activeCurveEditor } from '../../store/curveActions';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { Button, readSetting, writeSetting } from '../../ui';
import { EaseSelect } from '../timeline/EaseSelect';
import { CurveChannelList } from './CurveChannelList';
import { CurveEditor } from './CurveEditor';

/**
 * Редактор кривых: значения анимированных свойств во времени и ручки переходов между ключами.
 * По умолчанию — вкладкой рядом с таймлайном, G переключает между ними, как N — узлы.
 */
export function CurvesPanel() {
  const animation = useDocumentStore((s) => s.animation);
  const doc = useDocumentStore((s) => s.doc);
  const objectIds = useEditorStore((s) => s.selectedObjectIds);
  const selectedKeys = useEditorStore((s) => s.selectedKeys);
  const [all, setAll] = useState(() => readSetting<boolean>('curves-all', false));
  const [normalized, setNormalized] = useState(() =>
    readSetting<boolean>('curves-normalized', false),
  );
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const tracks = useMemo(
    () => curveTracks(animation, doc, objectIds, selectedKeys, all),
    [animation, doc, objectIds, selectedKeys, all],
  );
  const channels = useMemo(() => curveChannels(animation, doc, tracks), [animation, doc, tracks]);
  const visible = channels.filter((c) => !hidden.has(c.id));

  const toggleAll = (): void => {
    writeSetting('curves-all', !all);
    setAll(!all);
  };
  const toggleNormalized = (): void => {
    writeSetting('curves-normalized', !normalized);
    setNormalized(!normalized);
  };
  const toggleChannel = (id: string): void =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section className="timeline curve-panel" aria-label="Кривые">
      <div className="timeline-toolbar">
        <div className="timeline-group">
          <EaseSelect />
          <Button
            size="sm"
            active={all}
            label="Все треки, а не только выбранных объектов и выделенных ключей"
            onClick={toggleAll}
          >
            Все треки
          </Button>
          <Button
            size="sm"
            active={normalized}
            label="Каждая кривая в своём размахе −1…1: поворот в сотни градусов не сплющит положение"
            onClick={toggleNormalized}
          >
            Нормировать
          </Button>
          <Button
            icon
            size="sm"
            label="Вписать кривые в окно"
            hotkey="Home"
            disabled={visible.length === 0}
            onClick={() => activeCurveEditor()?.fit()}
          >
            <Maximize2 size={14} />
          </Button>
        </div>
        <span className="dim curve-panel-hint">
          Тяни ключ — время и значение, с Shift — по одной оси; тяни ручку — характер перехода
        </span>
      </div>
      {channels.length === 0 ? (
        <p className="panel-hint curve-empty">
          Кривых нет: поставь ключ (K или ромбом у свойства), и здесь появится его кривая.
        </p>
      ) : (
        <div className="curve-body">
          <CurveChannelList channels={channels} hidden={hidden} onToggle={toggleChannel} />
          <CurveEditor
            channels={visible}
            fitKey={`${objectIds.join(',')}|${all}`}
            normalized={normalized}
          />
        </div>
      )}
    </section>
  );
}
