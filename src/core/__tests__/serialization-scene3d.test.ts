import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64 } from '../base64';
import { frameDocument } from '../animation';
import { evaluate } from '../evaluate';
import { deserialize, serialize } from '../serialization';
import v11 from './fixtures/v11-scene3d.bp.json?raw';

type File = {
  frames: { layers: { scene?: { nodes: Record<string, unknown>[] } }[] }[];
  meshes: { parts: Record<string, unknown>[] }[];
  tracks: { property: string; keys: { v: unknown }[] }[];
};
const file = (): File => JSON.parse(v11) as File;
const load = (f: File) => () => deserialize(JSON.stringify(f));

describe('base64', () => {
  it('байты туда и обратно при любой добивке, чужое — ошибка', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37) & 255);
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    }
    expect(toBase64(new TextEncoder().encode('Man'))).toBe('TWFu');
    expect(toBase64(new TextEncoder().encode('Ma'))).toBe('TWE=');
    expect(() => fromBase64('TWF')).toThrow();
    expect(() => fromBase64('TW!u')).toThrow();
  });
});

describe('3D-сцена в файле (версия 11)', () => {
  it('фикстура читается: сцена слоя, модель, ключи тел и камеры', () => {
    const anim = deserialize(v11);
    const layer = frameDocument(anim, 0).layers[1];
    expect(layer.scene!.nodes.map((n) => [n.id, n.kind, n.mesh])).toEqual([
      ['body-cube', 'box', null],
      ['body-tri', 'mesh', 'mesh-tri'],
    ]);
    // Цвета в файле в верхнем регистре: в документе — в нижнем.
    expect(layer.scene!.nodes[0].color).toBe('#ff004d');
    expect(layer.scene!.camera).toMatchObject({ projection: 'orthographic', size: 3 });
    expect(layer.scene!.light.ambientColor).toBe('#ffffff');
    const [part] = anim.meshes[0].parts;
    expect([...part.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...part.indices]).toEqual([0, 1, 2]);
    expect(part.colors).toBeNull();
    expect(part.color).toBe('#29adff');
    expect([...part.texture!.data]).toEqual([255, 0, 77, 255]);
    expect(evaluate(anim, 500).layers[1].scene!.nodes[0].rotation).toEqual([15, 210, 0]);
    expect(evaluate(anim, 500).layers[1].scene!.camera.fov).toBe(50);
    expect(deserialize(serialize(anim))).toEqual(anim);
  });

  it('тело модели без модели, модель с чужим индексом или длиной файл не пройдут', () => {
    const noMesh = file();
    noMesh.frames[0].layers[1].scene!.nodes[1].mesh = 'mesh-gone';
    expect(load(noMesh)).toThrow(/bad mesh reference/);
    const primitive = file();
    primitive.frames[0].layers[1].scene!.nodes[0].mesh = 'mesh-tri';
    expect(load(primitive)).toThrow(/bad mesh reference/);
    const index = file();
    index.meshes[0].parts[0].indices = toBase64(
      new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
    );
    expect(load(index)).toThrow(/index past the last vertex/);
    const short = file();
    short.meshes[0].parts[0].normals = toBase64(new Uint8Array(12));
    expect(load(short)).toThrow(/does not match vertices/);
    const texture = file();
    (texture.meshes[0].parts[0].texture as { data: string }).data = toBase64(new Uint8Array(8));
    expect(load(texture)).toThrow(/texture size/);
    const nan = file();
    // Первое число — NaN (0x7fc00000), дальше нули: девять чисел, три вершины.
    const bytes = new Uint8Array(36);
    bytes.set([0, 0, 0xc0, 0x7f]);
    nan.meshes[0].parts[0].positions = toBase64(bytes);
    expect(load(nan)).toThrow(/non-finite/);
  });

  it('ключ тела — ровно три числа в пределах, свойство — из своего списка', () => {
    const pair = file();
    pair.tracks[0].keys[0].v = [1, 2];
    expect(load(pair)).toThrow(/wrong shape/);
    const far = file();
    far.tracks[0].keys[0].v = [0, 0, 1e9];
    expect(load(far)).toThrow(/out of range/);
    const unknown = file();
    unknown.tracks[1].property = 'zoom';
    expect(load(unknown)).toThrow(/Unknown scene3d property: zoom/);
  });
});
