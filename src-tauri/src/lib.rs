//! Оболочка настольного приложения. Весь редактор — веб-часть из `src`; здесь только окно и
//! плагины: нативные диалоги, файлы на диске со слежением за изменениями и память о файлах,
//! которые пользователь открывал через диалог, между запусками.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .run(tauri::generate_context!())
        .expect("не удалось запустить Bytefall");
}
