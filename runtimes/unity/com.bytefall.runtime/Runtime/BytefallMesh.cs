using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Bytefall
{
    /// <summary>
    /// Меш кадра: на символ квадрат фона из белой ячейки атласа и квадрат глифа, оба окрашены
    /// цветом вершин. Материалу нужна «текстура × цвет вершины» — это Sprites/Default.
    /// </summary>
    public static class BytefallMesh
    {
        public struct Options
        {
            public float cellSize;
            public bool centered;
            public bool drawBackground;
            public Color tint;
            /// <summary>Проект в линейном цвете: цвета файла sRGB, их надо перевести.</summary>
            public bool linear;
        }

        static readonly Vector2[] Corners =
        {
            new Vector2(-0.5f, -0.5f), new Vector2(0.5f, -0.5f),
            new Vector2(0.5f, 0.5f), new Vector2(-0.5f, 0.5f),
        };

        public static Mesh Build(BytefallAnimation anim, int frame, Options options)
        {
            var mesh = new Mesh { name = $"frame {frame}", hideFlags = HideFlags.DontSave };
            var builder = new Builder(anim, options);
            if (options.drawBackground && anim.background.a > 0f)
            {
                var size = new Vector2(anim.canvasSize.x, anim.canvasSize.y);
                builder.Quad(size * 0.5f, 0f, size, builder.White, anim.background);
            }
            byte[] data = anim.data;
            for (int i = anim.offsets[frame]; i < anim.offsets[frame + 1]; i++)
            {
                int at = i * BytefallAnimation.GlyphBytes;
                var center = new Vector2(BitConverter.ToSingle(data, at), BitConverter.ToSingle(data, at + 4));
                float rot = BitConverter.ToSingle(data, at + 8);
                var size = new Vector2(BitConverter.ToSingle(data, at + 12), BitConverter.ToSingle(data, at + 16));
                int glyph = BitConverter.ToUInt16(data, at + 20);
                Color fg = new Color32(data[at + 24], data[at + 25], data[at + 26], data[at + 27]);
                Color bg = new Color32(data[at + 28], data[at + 29], data[at + 30], data[at + 31]);
                if (bg.a > 0f) builder.Quad(center, rot, size, builder.White, bg);
                if (glyph > 0 && fg.a > 0f) builder.Quad(center, rot, size, builder.Cell(glyph), fg);
            }
            builder.Fill(mesh);
            return mesh;
        }

        class Builder
        {
            readonly List<Vector3> _vertices = new List<Vector3>();
            readonly List<Vector2> _uvs = new List<Vector2>();
            readonly List<Color> _colors = new List<Color>();
            readonly List<int> _triangles = new List<int>();
            readonly BytefallAnimation _anim;
            readonly Options _options;
            readonly Vector2 _origin;

            public Builder(BytefallAnimation anim, Options options)
            {
                _anim = anim;
                _options = options;
                _origin = options.centered ? -0.5f * new Vector2(anim.canvasSize.x, anim.canvasSize.y) : Vector2.zero;
                var white = Cell(0);
                White = new Rect(white.center, Vector2.zero);
            }

            /// <summary>Середина белой ячейки: фону нужен чистый белый, без краёв.</summary>
            public Rect White { get; }

            /// <summary>Ячейка атласа в UV. Строки атласа идут сверху, а v в Unity — снизу.</summary>
            public Rect Cell(int index)
            {
                float w = 1f / _anim.atlasColumns;
                float h = 1f / _anim.atlasRows;
                int column = index % _anim.atlasColumns;
                int row = index / _anim.atlasColumns;
                return new Rect(column * w, 1f - (row + 1) * h, w, h);
            }

            /// <summary>
            /// Квадрат вокруг центра в ячейках документа: масштаб, поворот по часовой (ось Y
            /// документа вниз), затем в мир — ось Y вверх.
            /// </summary>
            public void Quad(Vector2 center, float rot, Vector2 size, Rect uv, Color color)
            {
                float c = Mathf.Cos(rot);
                float s = Mathf.Sin(rot);
                color *= _options.tint;
                if (_options.linear) color = color.linear;
                int start = _vertices.Count;
                for (int k = 0; k < 4; k++)
                {
                    var local = Vector2.Scale(Corners[k], size);
                    var doc = center + new Vector2(c * local.x - s * local.y, s * local.x + c * local.y) + _origin;
                    _vertices.Add(new Vector3(doc.x, -doc.y, 0f) * _options.cellSize);
                    _colors.Add(color);
                }
                // Левый верхний угол глифа — верх ячейки атласа, то есть yMax в UV.
                _uvs.Add(new Vector2(uv.xMin, uv.yMax));
                _uvs.Add(new Vector2(uv.xMax, uv.yMax));
                _uvs.Add(new Vector2(uv.xMax, uv.yMin));
                _uvs.Add(new Vector2(uv.xMin, uv.yMin));
                _triangles.AddRange(new[] { start, start + 1, start + 2, start, start + 2, start + 3 });
            }

            public void Fill(Mesh mesh)
            {
                if (_vertices.Count > 65535) mesh.indexFormat = IndexFormat.UInt32;
                mesh.SetVertices(_vertices);
                mesh.SetUVs(0, _uvs);
                mesh.SetColors(_colors);
                mesh.SetTriangles(_triangles, 0);
                mesh.RecalculateBounds();
            }
        }
    }
}
