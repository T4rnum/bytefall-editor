import { ChevronDown } from 'lucide-react';
import { platform } from '../io/platform';
import { clearRecentAction, openRecentAction, useRecentStore } from '../store/desktopActions';
import { Menu, type MenuItem } from '../ui';

/** Папка файла коротко: имени мало, когда два файла с одним именем лежат в разных местах. */
const folderOf = (path: string): string => {
  const parts = path.split(/[\\/]/);
  return parts.length > 1 ? parts[parts.length - 2] : '';
};

/**
 * Недавние файлы рядом с «Открыть»: только в настольном приложении — в браузере у файлов нет
 * пути, по которому их можно открыть снова.
 */
export function RecentMenu() {
  const files = useRecentStore((s) => s.files);
  if (!platform.desktop) return null;
  const items: MenuItem[] =
    files.length === 0
      ? [{ label: 'Недавних файлов пока нет', disabled: true, onSelect: () => undefined }]
      : [
          ...files.map((f, i) => ({
            label: folderOf(f.path) ? `${f.name} · ${folderOf(f.path)}` : f.name,
            hotkey: i === 0 ? 'Ctrl+Shift+O' : undefined,
            onSelect: () => void openRecentAction(f.path),
          })),
          { separator: true },
          { label: 'Очистить список', onSelect: clearRecentAction },
        ];
  return (
    <Menu icon size="sm" label="Недавние файлы" items={items}>
      <ChevronDown size={14} />
    </Menu>
  );
}
