import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FG } from '../../../core/cell';
import { activeBrush, brushOf, useEditorStore } from '../editorStore';

const state = () => useEditorStore.getState();

describe('две кисти', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeBrush: 0,
      brushes: [
        { glyph: '#', fg: DEFAULT_FG, bg: null },
        { glyph: '', fg: DEFAULT_FG, bg: null },
      ],
    });
  });

  it('правки уходят только в активную кисть', () => {
    state().setActiveBrush(1);
    state().setGlyph('@');
    state().setFg('#ff0000');
    expect(brushOf(state(), 2)).toEqual({ glyph: '@', fg: '#ff0000', bg: null });
    expect(brushOf(state(), 0)).toEqual({ glyph: '#', fg: DEFAULT_FG, bg: null });
  });

  it('кнопка мыши выбирает кисть: всё, кроме правой, берёт первую', () => {
    expect(brushOf(state(), 0)).toBe(state().brushes[0]);
    expect(brushOf(state(), 1)).toBe(state().brushes[0]);
    expect(brushOf(state(), 2)).toBe(state().brushes[1]);
  });

  it('обмен цветов не трогает соседнюю кисть', () => {
    state().setBg('#000080');
    state().swapColors();
    expect(activeBrush(state())).toEqual({ glyph: '#', fg: '#000080', bg: DEFAULT_FG });
    expect(state().brushes[1]).toEqual({ glyph: '', fg: DEFAULT_FG, bg: null });
  });

  it('без фона обмен цветов ничего не портит', () => {
    state().swapColors();
    expect(activeBrush(state())).toEqual({ glyph: '#', fg: DEFAULT_FG, bg: null });
  });

  it('кисти меняются местами целиком', () => {
    const [left, right] = state().brushes;
    state().swapBrushes();
    expect(state().brushes).toEqual([right, left]);
  });
});
