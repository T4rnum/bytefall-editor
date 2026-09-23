import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAnimation, frameDocument } from '../../../core/animation';
import { createDocument } from '../../../core/document';
import { PALETTE_PRESETS, RAMP_PRESETS } from '../../../core/quantize';
import { imageName, isImageFile } from '../../io/image';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';
import { applyImageImportAction, closeImageImport, previewImageImport } from '../importActions';
import { initialSettings, loadStyle, quantizeOptionsOf, saveStyle } from '../importSettings';
import { useUiStore } from '../uiStore';

const tiny = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255]) };
const converted = {
  name: 'кот',
  width: 2,
  height: 1,
  cells: new Map([[0, { glyph: '@', fg: '#ff0000', bg: null }]]),
};

describe('файлы картинок', () => {
  it('картинка узнаётся по типу, а без типа — по расширению', () => {
    expect(isImageFile({ name: 'a.bin', type: 'image/png' })).toBe(true);
    expect(isImageFile({ name: 'Кот.JPEG', type: '' })).toBe(true);
    expect(isImageFile({ name: 'doc.bp.json', type: 'application/json' })).toBe(false);
    expect(imageName('закат.final.png')).toBe('закат.final');
    expect(imageName('.png')).toBe('.png');
  });
});

describe('настройки импорта', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    Object.assign(globalThis, {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('рампа и палитра раскрываются в символы и цвета', () => {
    const settings = {
      ...initialSettings(tiny, { width: 80 }, false),
      ramp: 'dots',
      palette: 'pico8',
    };
    const options = quantizeOptionsOf(settings, { coverage: () => 0.5, documentPalette: [] });
    expect(options.ramp).toBe(RAMP_PRESETS.find((r) => r.id === 'dots')!.glyphs);
    expect(options.palette).toEqual(PALETTE_PRESETS.find((p) => p.id === 'pico8')!.colors);
    const mono = quantizeOptionsOf(
      { ...settings, palette: 'mono', monoColor: '#123456' },
      { coverage: () => 0.5, documentPalette: [] },
    );
    expect(mono.palette).toEqual(['#123456']);
    const doc = quantizeOptionsOf(
      { ...settings, palette: 'document' },
      { coverage: () => 0.5, documentPalette: ['#000000', '#ffffff'] },
    );
    expect(doc.palette).toEqual(['#000000', '#ffffff']);
  });

  it('ширина по картинке и холсту, стиль запоминается, а испорченный — отбрасывается', () => {
    expect(initialSettings(tiny, { width: 80 }, false).width).toBe(8);
    expect(initialSettings({ ...tiny, width: 5000 }, { width: 80 }, false).width).toBe(80);
    expect(initialSettings({ ...tiny, width: 5000 }, { width: 80 }, true).width).toBe(160);

    saveStyle({ ...initialSettings(tiny, { width: 80 }, false), contrast: 2, dither: 'noise' });
    expect(loadStyle()).toMatchObject({ contrast: 2, dither: 'noise' });

    store.set(
      'bytefall.ui.imageImport',
      JSON.stringify({ contrast: 'много', monoColor: 'красный' }),
    );
    expect(loadStyle()).toMatchObject({ contrast: 1, monoColor: '#ffffff' });
  });
});

describe('импорт в документ', () => {
  beforeEach(() => {
    useDocumentStore
      .getState()
      .replaceAnimation(createAnimation(createDocument({ width: 6, height: 4 })));
    useUiStore.setState({ imageImport: { name: 'кот', image: tiny } });
    useEditorStore.setState({ draft: null });
  });

  it('предпросмотр — черновик с новым слоем, документ не тронут', () => {
    previewImageImport(converted, false);
    const draft = useEditorStore.getState().draft!;
    expect(draft.layers.map((l) => l.name)).toEqual(['Слой 1', 'кот']);
    expect(useDocumentStore.getState().doc.layers).toHaveLength(1);
    expect(useDocumentStore.getState().history.past).toHaveLength(0);
  });

  it('вставка — одна запись истории, новый слой активен, черновик и окно закрыты', () => {
    previewImageImport(converted, true);
    applyImageImportAction(converted, true);
    const state = useDocumentStore.getState();
    expect(state.history.past).toHaveLength(1);
    expect([state.doc.width, state.doc.height]).toEqual([2, 1]);
    expect(state.doc.layers.find((l) => l.id === state.activeLayerId)?.name).toBe('кот');
    expect(useEditorStore.getState().draft).toBeNull();
    expect(useUiStore.getState().imageImport).toBeNull();
    state.undo();
    expect(frameDocument(useDocumentStore.getState().animation, 0).width).toBe(6);
  });

  it('отмена убирает черновик и ничего не пишет в историю', () => {
    previewImageImport(converted, false);
    closeImageImport();
    expect(useEditorStore.getState().draft).toBeNull();
    expect(useUiStore.getState().imageImport).toBeNull();
    expect(useDocumentStore.getState().history.past).toHaveLength(0);
  });
});
