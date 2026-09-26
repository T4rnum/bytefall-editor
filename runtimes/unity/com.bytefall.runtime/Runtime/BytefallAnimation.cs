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
            public float duration;
            public int count;
        }

        /// <summary>
        /// Читает файл <c>.bytefall</c> из байтов: так анимацию можно загрузить и в игре, например
        /// из StreamingAssets. Чужой или оборванный файл — null и причина в <paramref name="error"/>.
        /// </summary>
        public static BytefallAnimation FromBytes(byte[] bytes, out string error)
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

            int total = 0;
            var durations = new float[header.frames.Length];
            var offsets = new int[header.frames.Length + 1];
            for (int i = 0; i < header.frames.Length; i++)
            {
                durations[i] = header.frames[i].duration;
                offsets[i] = total;
                total += header.frames[i].count;
            }
            offsets[header.frames.Length] = total;
            if (at + total * GlyphBytes > bytes.Length)
            {
                error = "файл оборван";
                return null;
            }

            var atlas = new Texture2D(2, 2, TextureFormat.RGBA32, false)
            {
                name = "atlas",
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
            };
            if (!atlas.LoadImage(png))
            {
                error = "атлас не читается";
                return null;
            }
            var anim = CreateInstance<BytefallAnimation>();
            anim.canvasSize = new Vector2Int(header.width, header.height);
            if (!string.IsNullOrEmpty(header.background))
            {
                ColorUtility.TryParseHtmlString(header.background, out anim.background);
            }
            anim.fps = header.fps;
            anim.atlas = atlas;
            anim.material = new Material(Shader.Find("Sprites/Default"))
            {
                name = "material",
                mainTexture = atlas,
            };
            anim.atlasColumns = header.atlas.columns;
            anim.atlasRows = header.atlas.rows;
            anim.glyphs = header.atlas.glyphs;
            anim.durations = durations;
            anim.offsets = offsets;
            anim.data = new byte[total * GlyphBytes];
            Array.Copy(bytes, at, anim.data, 0, anim.data.Length);
            return anim;
        }
    }
}
