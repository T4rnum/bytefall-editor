using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Bytefall
{
    /// <summary>
    /// Меш кадра для шейдера <c>Bytefall/Glyph</c>: на символ квад фона и квад символа, а у
    /// символа с контуром или свечением ещё подложка шире ячейки. Порядок квадов — порядок
    /// отрисовки, поэтому весь кадр уходит одним вызовом.
    /// </summary>
    public static class BytefallMesh
    {
        public struct Options
        {
            /// <summary>Высота ячейки в единицах мира; ширина — по форме ячейки шрифта.</summary>
            public float cellSize;
            public bool centered;
            public bool drawBackground;
            public Color tint;
        }

        const float ModeSolid = 0f;
        const float ModeGlyph = 1f;
        const float ModeUnder = 2f;

        public static Mesh Build(BytefallAnimation anim, int frame, Options options)
        {
            var mesh = new Mesh { name = $"frame {frame}", hideFlags = HideFlags.DontSave };
            var builder = new Builder(anim, options);
            if (options.drawBackground && anim.background.a > 0f)
            {
                var size = new Vector2(anim.canvasSize.x, anim.canvasSize.y);
                builder.Quad(size * 0.5f, 0f, size, Vector2.zero, anim.background, new Vector3(0, 0, ModeSolid));
            }
            byte[] data = anim.data;
            for (int i = anim.offsets[frame]; i < anim.offsets[frame + 1]; i++)
            {
                int at = i * BytefallAnimation.GlyphBytes;
                var center = new Vector2(BitConverter.ToSingle(data, at), BitConverter.ToSingle(data, at + 4));
                float rot = BitConverter.ToSingle(data, at + 8);
                var size = new Vector2(BitConverter.ToSingle(data, at + 12), BitConverter.ToSingle(data, at + 16));
                int glyph = BitConverter.ToUInt16(data, at + 20);
                int flags = BitConverter.ToUInt16(data, at + 22);
                int material = flags & ~BytefallAnimation.UnderBit;
                Color fg = new Color32(data[at + 24], data[at + 25], data[at + 26], data[at + 27]);
                Color bg = new Color32(data[at + 28], data[at + 29], data[at + 30], data[at + 31]);
                if ((flags & BytefallAnimation.UnderBit) != 0)
                {
                    // Поле подложки в долях ячейки — самое широкое из контура (в пикселях шрифта) и
                    // свечения (в высотах ячейки).
                    float outline = anim.MaterialValue(material, BytefallAnimation.OutlineWidth);
                    float glow = anim.MaterialValue(material, 7);
                    var margin = Vector2.Max(
                        new Vector2(outline / anim.grid.x, outline / anim.grid.y),
                        new Vector2(glow / anim.CellAspect, glow));
                    builder.Quad(center, rot, size, margin, fg, new Vector3(glyph, material, ModeUnder));
                    continue;
                }
                if (bg.a > 0f) builder.Quad(center, rot, size, Vector2.zero, bg, new Vector3(0, material, ModeSolid));
                if (glyph > 0 && fg.a > 0f) builder.Quad(center, rot, size, Vector2.zero, fg, new Vector3(glyph, material, ModeGlyph));
            }
            builder.Fill(mesh);
            return mesh;
        }

        class Builder
        {
            readonly List<Vector3> _vertices = new List<Vector3>();
            readonly List<Vector2> _cells = new List<Vector2>();
            readonly List<Vector4> _custom0 = new List<Vector4>();
            readonly List<Vector4> _custom1 = new List<Vector4>();
            readonly List<Color> _colors = new List<Color>();
            readonly List<int> _triangles = new List<int>();
            readonly Options _options;
            readonly Vector2 _origin;
            /// <summary>
            /// Ширина ячейки к высоте: поворот и масштаб символа заданы на экране, где X ячейки
            /// умножен на это отношение, — так символ неквадратной ячейки вращается как жёсткое тело.
            /// </summary>
            readonly float _aspect;

            public Builder(BytefallAnimation anim, Options options)
            {
                _options = options;
                _aspect = anim.CellAspect;
                _origin = options.centered ? -0.5f * new Vector2(anim.canvasSize.x, anim.canvasSize.y) : Vector2.zero;
            }

            /// <summary>
            /// Квад вокруг центра в ячейках документа: ячейка с полем <paramref name="margin"/>,
            /// масштаб, поворот по часовой (ось Y документа вниз) — на экране, в видимом
            /// пространстве, — затем в мир: ось Y вверх, ячейка шириной в <c>_aspect</c> высоты.
            /// </summary>
            public void Quad(Vector2 center, float rot, Vector2 size, Vector2 margin, Color color, Vector3 custom)
            {
                float c = Mathf.Cos(rot);
                float s = Mathf.Sin(rot);
                var lo = -new Vector2(0.5f, 0.5f) - margin;
                var hi = new Vector2(0.5f, 0.5f) + margin;
                color *= _options.tint;
                int start = _vertices.Count;
                AddCorner(lo.x, lo.y);
                AddCorner(hi.x, lo.y);
                AddCorner(hi.x, hi.y);
                AddCorner(lo.x, hi.y);
                _triangles.AddRange(new[] { start, start + 1, start + 2, start, start + 2, start + 3 });

                void AddCorner(float x, float y)
                {
                    var local = new Vector2(x * size.x * _aspect, y * size.y);
                    var turned = new Vector2(c * local.x - s * local.y, s * local.x + c * local.y);
                    var doc = center + new Vector2(turned.x / _aspect, turned.y);
                    var at = doc + _origin;
                    _vertices.Add(new Vector3(at.x * _aspect, -at.y, 0f) * _options.cellSize);
                    _cells.Add(new Vector2(x + 0.5f, y + 0.5f));
                    _custom0.Add(new Vector4(custom.x, custom.y, custom.z, 0f));
                    // Блик бежит по экрану: координаты документа — в видимом пространстве.
                    _custom1.Add(new Vector4(doc.x * _aspect, doc.y, 0f, 0f));
                    _colors.Add(color);
                }
            }

            public void Fill(Mesh mesh)
            {
                if (_vertices.Count > 65535) mesh.indexFormat = IndexFormat.UInt32;
                mesh.SetVertices(_vertices);
                mesh.SetUVs(0, _cells);
                mesh.SetUVs(1, _custom0);
                mesh.SetUVs(2, _custom1);
                mesh.SetColors(_colors);
                mesh.SetTriangles(_triangles, 0);
                mesh.RecalculateBounds();
            }
        }
    }
}
