using System.IO;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace Bytefall.Editor
{
    /// <summary>
    /// Импорт файлов <c>.bytefall</c>: главный ассет — <see cref="BytefallAnimation"/>, внутри
    /// него атлас, таблица материалов и материал. Перетащите ассет в поле Animation компонента
    /// Bytefall Player.
    /// </summary>
    [ScriptedImporter(2, "bytefall")]
    public sealed class BytefallImporter : ScriptedImporter
    {
        const string ShaderPath = "Packages/com.bytefall.runtime/Runtime/Resources/BytefallGlyph.shader";

        public override void OnImportAsset(AssetImportContext ctx)
        {
            // Шейдер должен быть импортирован раньше файла: иначе при первом открытии проекта
            // Shader.Find его ещё не видит.
            ctx.DependsOnArtifact(ShaderPath);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(ShaderPath);
            var bytes = File.ReadAllBytes(ctx.assetPath);
            var anim = BytefallAnimation.FromBytes(bytes, out string error, shader);
            if (anim == null)
            {
                ctx.LogImportError($"Bytefall: {error}");
                return;
            }
            anim.name = Path.GetFileNameWithoutExtension(ctx.assetPath);
            ctx.AddObjectToAsset("atlas", anim.atlas);
            ctx.AddObjectToAsset("materials", anim.materialTexture);
            ctx.AddObjectToAsset("material", anim.material);
            ctx.AddObjectToAsset("animation", anim);
            ctx.SetMainObject(anim);
        }
    }
}
