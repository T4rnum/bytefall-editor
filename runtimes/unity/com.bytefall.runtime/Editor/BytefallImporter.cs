using System.IO;
using UnityEditor.AssetImporters;

namespace Bytefall.Editor
{
    /// <summary>
    /// Импорт файлов <c>.bytefall</c>: главный ассет — <see cref="BytefallAnimation"/>, внутри
    /// него атлас и материал. Перетащите ассет в поле Animation компонента Bytefall Player.
    /// </summary>
    [ScriptedImporter(1, "bytefall")]
    public sealed class BytefallImporter : ScriptedImporter
    {
        public override void OnImportAsset(AssetImportContext ctx)
        {
            var anim = BytefallAnimation.FromBytes(File.ReadAllBytes(ctx.assetPath), out string error);
            if (anim == null)
            {
                ctx.LogImportError($"Bytefall: {error}");
                return;
            }
            anim.name = Path.GetFileNameWithoutExtension(ctx.assetPath);
            ctx.AddObjectToAsset("atlas", anim.atlas);
            ctx.AddObjectToAsset("material", anim.material);
            ctx.AddObjectToAsset("animation", anim);
            ctx.SetMainObject(anim);
        }
    }
}
