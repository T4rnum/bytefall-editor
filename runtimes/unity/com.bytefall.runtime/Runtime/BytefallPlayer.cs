using System;
using System.Collections.Generic;
using UnityEngine;

namespace Bytefall
{
    /// <summary>
    /// Играет <see cref="BytefallAnimation"/>: кадр — один меш из квадов, фон и символ на символ,
    /// рисуется одним вызовом. Меш кадра строится при первом показе и дальше берётся из кэша.
    /// </summary>
    [ExecuteAlways]
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    [AddComponentMenu("Bytefall/Bytefall Player")]
    public sealed class BytefallPlayer : MonoBehaviour
    {
        [SerializeField] BytefallAnimation _animation;
        [Tooltip("Размер ячейки в единицах мира. 0.16 — 16 пикселей при 100 пикселях на единицу.")]
        public float cellSize = 0.16f;
        [Tooltip("Центр холста в начале координат объекта; иначе там левый верхний угол.")]
        public bool centered = true;
        [Tooltip("Рисовать цвет холста под символами.")]
        public bool drawBackground = true;
        [Tooltip("Множитель цвета всей анимации.")]
        public Color tint = Color.white;
        public int sortingOrder;
        public bool playOnAwake = true;
        public bool loop = true;
        public float speed = 1f;

        /// <summary>Анимация без петли дошла до конца.</summary>
        public event Action Finished;

        public bool IsPlaying { get; private set; }
        /// <summary>Время от начала анимации, мс.</summary>
        public float Time { get; private set; }
        public int Frame { get; private set; }

        readonly Dictionary<int, Mesh> _meshes = new Dictionary<int, Mesh>();
        MeshFilter _filter;
        MeshRenderer _renderer;

        public BytefallAnimation Animation
        {
            get => _animation;
            set
            {
                _animation = value;
                Refresh();
                Seek(0f);
            }
        }

        void OnEnable()
        {
            _filter = GetComponent<MeshFilter>();
            _renderer = GetComponent<MeshRenderer>();
            Refresh();
            if (playOnAwake && Application.isPlaying) Play();
        }

        void OnDisable() => ClearMeshes();

        void OnValidate()
        {
            if (isActiveAndEnabled) Refresh();
        }

        public void Play() => IsPlaying = true;

        public void Pause() => IsPlaying = false;

        public void Stop()
        {
            IsPlaying = false;
            Seek(0f);
        }

        /// <summary>Переходит к моменту <paramref name="timeMs"/> от начала.</summary>
        public void Seek(float timeMs)
        {
            if (_animation == null || _animation.FrameCount == 0) return;
            float total = _animation.TotalDuration;
            Time = loop ? Mathf.Repeat(timeMs, total) : Mathf.Clamp(timeMs, 0f, total);
            int frame = _animation.FrameAt(Time);
            if (frame == Frame && _filter != null && _filter.sharedMesh != null) return;
            Frame = frame;
            Show();
        }

        /// <summary>Сбрасывает кэш мешей: после смены размера, цвета или анимации из кода.</summary>
        public void Refresh()
        {
            ClearMeshes();
            if (_renderer != null && _animation != null)
            {
                _renderer.sharedMaterial = _animation.material;
                _renderer.sortingOrder = sortingOrder;
            }
            Frame = _animation != null ? Mathf.Clamp(Frame, 0, Mathf.Max(0, _animation.FrameCount - 1)) : 0;
            Show();
        }

        void Update()
        {
            if (!IsPlaying || !Application.isPlaying || _animation == null) return;
            float total = _animation.TotalDuration;
            float next = Time + UnityEngine.Time.deltaTime * 1000f * speed;
            if (!loop && next >= total)
            {
                Seek(total);
                IsPlaying = false;
                Finished?.Invoke();
                return;
            }
            Seek(next);
        }

        void Show()
        {
            if (_filter == null) return;
            if (_animation == null || _animation.FrameCount == 0)
            {
                _filter.sharedMesh = null;
                return;
            }
            if (!_meshes.TryGetValue(Frame, out var mesh))
            {
                mesh = BytefallMesh.Build(_animation, Frame, Options());
                _meshes[Frame] = mesh;
            }
            _filter.sharedMesh = mesh;
        }

        BytefallMesh.Options Options() => new BytefallMesh.Options
        {
            cellSize = cellSize,
            centered = centered,
            drawBackground = drawBackground,
            tint = tint,
            linear = QualitySettings.activeColorSpace == ColorSpace.Linear,
        };

        void ClearMeshes()
        {
            foreach (var mesh in _meshes.Values)
            {
                if (Application.isPlaying) Destroy(mesh);
                else DestroyImmediate(mesh);
            }
            _meshes.Clear();
        }
    }
}
