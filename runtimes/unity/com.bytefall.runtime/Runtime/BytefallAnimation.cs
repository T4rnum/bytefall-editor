using System;
using System.Text;
using UnityEngine;

namespace Bytefall
{
    /// <summary>
    /// Анимация из Bytefall Editor: атлас символов и поток символов на каждый кадр.
    /// Файл <c>.bytefall</c> превращается в этот ассет при импорте, в сцене его играет
    /// <see cref="BytefallPlayer"/>. Раскладка файла описана в <c>src/core/bytefall.ts</c>.
    /// </summary>
    public sealed class BytefallAnimation : ScriptableObject
    {
        public const int Version = 1;
        public const int GlyphBytes = 32;
        /// <summary>Чисел на материал в таблице, раскладка — <c>src/core/material.ts</c>.</summary>
        public const int MaterialFloats = 17;
        /// <summary>Старший бит поля материала: запись — подложка символа (контур и свечение).</summary>
        public const int UnderBit = 0x8000;
        const string Magic = "BYTEFALL";

        [Tooltip("Размер холста в ячейках.")]
        public Vector2Int canvasSize;
        [Tooltip("Цвет холста. Альфа 0 — холст прозрачный.")]
        public Color background = Color.clear;
        public float fps = 20f;
        [Tooltip("Ячейка 0 белая, символ glyphs[i] — в ячейке i + 1.")]
        public Texture2D atlas;
        public Material material;
        public int atlasColumns = 1;
        public int atlasRows = 1;
        public string[] glyphs = Array.Empty<string>();
        [Tooltip("Таблица материалов, по 17 чисел подряд.")]
        public float[] materials = Array.Empty<float>();
        [Tooltip("Та же таблица текстурой для шейдера: 5 текселей на материал, строка на материал.")]
        public Texture2D materialTexture;
        [Tooltip("Момент сцены каждого кадра, мс: по нему бежит блик.")]
        public float[] times = Array.Empty<float>();
        [Tooltip("Длительность каждого кадра, мс.")]
        public float[] durations = Array.Empty<float>();
        [Tooltip("Начало кадра в data в символах; последний элемент — число всех символов.")]
        public int[] offsets = { 0 };
        [HideInInspector]
        public byte[] data = Array.Empty<byte>();

        public int FrameCount => durations.Length;

        /// <summary>Длительность всей анимации, мс.</summary>
        public float TotalDuration
        {
            get
            {
                float sum = 0f;
                foreach (float d in durations) sum += d;
                return sum;
            }
        }

        /// <summary>Число материала <paramref name="index"/> (с 1) по смещению раскладки.</summary>
        public float MaterialValue(int index, int offset) =>
            index <= 0 ? 0f : materials[(index - 1) * MaterialFloats + offset];

        /// <summary>Кадр, который виден в момент <paramref name="timeMs"/> от начала.</summary>
        public int FrameAt(float timeMs)
        {
            float end = 0f;
            for (int i = 0; i < durations.Length; i++)
            {
                end += durations[i];
                if (timeMs < end) return i;
            }
            return Mathf.Max(0, durations.Length - 1);
        }

        [Serializable]
        class Header
        {
            public int width;
            public int height;
            public string background;
            public float fps;
            public AtlasInfo atlas;
            public float[] materials;
            public FrameInfo[] frames;
        }

        [Serializable]
        class AtlasInfo
        {
            public int columns;
            public int rows;
            public string[] glyphs;
        }

        [Serializable]
        class FrameInfo
        {
            public float time;
            public float duration;
            public int count;
        }

        /// <summary>
        /// Читает файл <c>.bytefall</c> из байтов: так анимацию можно загрузить и в игре, например
        /// из StreamingAssets. Чужой или оборванный файл — null и причина в <paramref name="error"/>.
        /// Шейдер по умолчанию — <c>Bytefall/Glyph</c>, он лежит в Resources пакета и есть в сборке.
        /// </summary>
        public static BytefallAnimation FromBytes(byte[] bytes, out string error, Shader shader = null)
        {
            error = null;
            if (bytes == null || bytes.Length < 16 || Encoding.ASCII.GetString(bytes, 0, 8) != Magic)
            {
                error = "это не файл .bytefall";
                return null;
            }
            if (BitConverter.ToUInt16(bytes, 8) > Version)
            {
                error = "файл новее рантайма, обновите пакет";
                return null;
            }
            int at = 12;
            int jsonLength = (int)BitConverter.ToUInt32(bytes, at);
            var header = JsonUtility.FromJson<Header>(Encoding.UTF8.GetString(bytes, at + 4, jsonLength));
            at += 4 + jsonLength;
            int pngLength = (int)BitConverter.ToUInt32(bytes, at);
            var png = new byte[pngLength];
            Array.Copy(bytes, at + 4, png, 0, pngLength);
            at += 4 + pngLength;

            var anim = CreateInstance<BytefallAnimation>();
            int total = anim.ReadFrames(header.frames);
            if (at + total * GlyphBytes > bytes.Length)
            {
                error = "файл оборван";
                return null;
            }
            anim.atlas = new Texture2D(2, 2, TextureFormat.RGBA32, false)
            {
                name = "atlas",
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
            };
            if (!anim.atlas.LoadImage(png))
            {
                error = "атлас не читается";
                return null;
            }
            anim.canvasSize = new Vector2Int(header.width, header.height);
            if (!string.IsNullOrEmpty(header.background))
            {
                ColorUtility.TryParseHtmlString(header.background, out anim.background);
            }
            anim.fps = header.fps;
            anim.atlasColumns = header.atlas.columns;
            anim.atlasRows = header.atlas.rows;
            anim.glyphs = header.atlas.glyphs;
            anim.materials = header.materials ?? Array.Empty<float>();
            anim.materialTexture = MaterialTexture(anim.materials);
            shader = shader != null ? shader : Shader.Find("Bytefall/Glyph");
            if (shader == null)
            {
                error = "не найден шейдер Bytefall/Glyph";
                return null;
            }
            anim.material = new Material(shader) { name = "material" };
            anim.material.SetTexture("_MainTex", anim.atlas);
            anim.material.SetTexture("_Materials", anim.materialTexture);
            anim.material.SetVector("_AtlasGrid", new Vector4(anim.atlasColumns, anim.atlasRows, 0, 0));
            anim.data = new byte[total * GlyphBytes];
            Array.Copy(bytes, at, anim.data, 0, anim.data.Length);
            return anim;
        }

        /// <summary>Моменты, длительности и начала кадров; возвращает число всех символов.</summary>
        int ReadFrames(FrameInfo[] frames)
        {
            times = new float[frames.Length];
            durations = new float[frames.Length];
            offsets = new int[frames.Length + 1];
            int total = 0;
            for (int i = 0; i < frames.Length; i++)
            {
                times[i] = frames[i].time;
                durations[i] = frames[i].duration;
                offsets[i] = total;
                total += frames[i].count;
            }
            offsets[frames.Length] = total;
            return total;
        }

        /// <summary>Материалы строками по 5 текселей RGBA float: 17 чисел и три нуля добивки.</summary>
        static Texture2D MaterialTexture(float[] values)
        {
            int count = values.Length / MaterialFloats;
            var texels = new float[Mathf.Max(1, count) * 20];
            for (int row = 0; row < count; row++)
            {
                Array.Copy(values, row * MaterialFloats, texels, row * 20, MaterialFloats);
            }
            var texture = new Texture2D(5, Mathf.Max(1, count), TextureFormat.RGBAFloat, false, true)
            {
                name = "materials",
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
            };
            texture.SetPixelData(texels, 0);
            texture.Apply(false, false);
            return texture;
        }
    }
}
