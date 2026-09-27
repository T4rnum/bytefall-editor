import { useEffect, useState } from 'react';
import { fallbackFont, loadBuiltinFace, loadDocumentFont } from '../../render/font/documentFont';
import { useDocumentStore } from '../store/documentStore';
import { useFontStore } from '../store/fontStore';
import { errorMessage, notify } from '../store/notifyStore';

/**
 * Держит атлас холста в согласии со шрифтом документа. Пока новый шрифт грузится, холст рисует
 * прежним. Свой шрифт, который не загрузился, заменяется встроенным в той же ячейке: документ
 * открыт, геометрия та же, неверен только вид символов — и об этом сказано. Отдаёт ошибку,
 * только если не загрузился и встроенный: тогда рисовать нечем.
 */
export function useDocumentFont(): string | null {
  const font = useDocumentStore((s) => s.animation.font);
  const [fatal, setFatal] = useState<string | null>(null);
  const key = `${font.id}:${font.cellWidth}x${font.cellHeight}`;

  useEffect(() => {
    let cancelled = false;
    const load = loadBuiltinFace()
      .then(() => loadDocumentFont(font))
      .catch((error: unknown) => {
        if (font.kind === 'builtin') throw error;
        notify(
          `Шрифт «${font.name}» не загрузился (${errorMessage(error)}): символы нарисованы встроенным`,
          'error',
        );
        return loadDocumentFont(fallbackFont(font));
      });
    load
      .then((loaded) => {
        if (!cancelled) useFontStore.getState().setLoaded(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFatal(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
    // Шрифт меняется целиком, и ключ описывает его полностью: отпечаток и ячейка.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return fatal;
}
