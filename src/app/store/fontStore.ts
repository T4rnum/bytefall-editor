import { create } from 'zustand';
import type { GlyphGroup } from '../../core/font/charset';
import type { DocumentFont } from '../../core/font/font';
import type { GlyphLook, LoadedFont } from '../../render/font/documentFont';
import { GlyphAtlas } from '../../render/font/GlyphAtlas';

interface FontState {
  /** Шрифт, которым сейчас рисуется холст: пока новый грузится, остаётся прежний. */
  readonly font: DocumentFont | null;
  readonly atlas: GlyphAtlas | null;
  readonly groups: readonly GlyphGroup[];
  readonly look: GlyphLook | null;
  setLoaded: (loaded: LoadedFont) => void;
}

/** Загруженный шрифт документа: атлас холста и палитра символов. В файл не попадает. */
export const useFontStore = create<FontState>((set) => ({
  font: null,
  atlas: null,
  groups: [],
  look: null,
  setLoaded: (loaded) =>
    set({
      font: loaded.font,
      atlas: new GlyphAtlas({ painter: loaded.painter }),
      groups: loaded.groups,
      look: loaded.look,
    }),
}));
