/**
 * Мелкие настройки вида: свёрнута ли панель, какой ширины сайдбар. Хранятся в localStorage и
 * живут только у этого пользователя в этом браузере.
 *
 * Сюда нельзя класть ничего, что относится к документу: localStorage может быть недоступен,
 * очищен или выключен, и любое чтение способно бросить исключение. Всё, что тут лежит, должно
 * иметь разумное значение по умолчанию.
 */

const PREFIX = 'bytefall.ui.';

export function readSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Приватный режим или заблокированное хранилище: настройка просто не переживёт перезагрузку.
  }
}
