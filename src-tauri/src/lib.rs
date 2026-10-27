use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_fs::FsExt;

/// First CLI arg that is an existing file, made absolute and readable by the fs plugin
/// (its scope only covers $HOME etc., so files on other mounts would fail to open).
fn file_arg(app: &AppHandle, args: &[String], cwd: &Path) -> Option<String> {
    let path = cwd.join(args.iter().skip(1).find(|a| !a.starts_with('-'))?);
    if !path.is_file() {
        return None;
    }
    let _ = app.fs_scope().allow_file(&path);
    Some(path.to_string_lossy().into_owned())
}

/// File the app was launched with. Pulled by the webview once it listens, so it can't be missed.
#[tauri::command]
fn startup_file(app: AppHandle) -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    file_arg(&app, &args, &std::env::current_dir().unwrap_or_default())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // Focus the existing window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
            // If the second instance was invoked with a file argument, open it
            if let Some(path) = file_arg(app, &argv, Path::new(&cwd)) {
                let _ = app.emit("file-open", path);
            }
        }))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // No native menu — the in-app menubar handles all actions.
            // This lets the native GTK title bar show the window title
            // with proper minimize/maximize/close controls.

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![startup_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
