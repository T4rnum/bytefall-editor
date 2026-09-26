export type HotkeyGroup =
  'Файл' | 'Правка' | 'Объекты' | 'Узлы' | '3D' | 'Анимация' | 'Вид' | 'Инструменты';

export interface Hotkey {
  readonly group: HotkeyGroup;
  readonly label: string;
  /** Запись клавиш: она же показывается в справке и она же разбирается в обработчик. */
  readonly keys: string;
  /** Показывать ли в справке: дубли вроде Ctrl+Y её только засоряют. */
  readonly hidden?: boolean;
  /**
   * Сочетание действует, только пока верно условие, и тогда оно важнее инструмента: Delete при
   * выделенных ключах удаляет ключи, а не объект, выбранный инструментом.
   */
  readonly when?: () => boolean;
  readonly run: () => void;
}
