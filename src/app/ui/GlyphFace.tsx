import type { CSSProperties } from 'react';
import { TILESET_COLUMNS, tilesetIndex } from '../../core/font/tileset';
import type { GlyphLook } from '../../render/font/documentFont';

export interface GlyphFaceProps {
  readonly glyph: string;
  /** Как рисовать символ; null — пока шрифт документа грузится, символ пишется шрифтом интерфейса. */
  readonly look: GlyphLook | null;
  /** Высота, до которой символ растёт целыми шагами сетки шрифта, в пикселях. */
  readonly height: number;
}

/**
 * Символ шрифта документа вне холста. Масштаб целый: пиксельный шрифт в палитре такой же
 * чёткий, как на холсте. Лист символов рисуется маской по цвету текста.
 */
export function GlyphFace({ glyph, look, height }: GlyphFaceProps) {
  if (!look) return <span className="glyph-face">{glyph}</span>;
  if (look.kind === 'family') {
    const scale = Math.max(1, Math.floor(height / look.cellHeight));
    const style: CSSProperties = {
      fontFamily: `"${look.family}"`,
      fontSize: `${look.size * scale}px`,
    };
    return (
      <span className="glyph-face" style={style}>
        {glyph}
      </span>
    );
  }
  const scale = Math.max(1, Math.floor(height / look.cellHeight));
  const w = look.cellWidth * scale;
  const h = look.cellHeight * scale;
  const index = tilesetIndex(glyph);
  const style: CSSProperties = {
    width: `${w}px`,
    height: `${h}px`,
    maskImage: `url(${look.url})`,
    maskSize: `${w * TILESET_COLUMNS}px auto`,
    maskPosition: `${-(index % TILESET_COLUMNS) * w}px ${-Math.floor(index / TILESET_COLUMNS) * h}px`,
  };
  return <span className="glyph-face glyph-face--sheet" style={style} aria-label={glyph} />;
}
