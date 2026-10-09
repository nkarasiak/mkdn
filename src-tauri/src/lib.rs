use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// File passed on the command line at launch; the frontend pulls it once ready.
struct InitialFile(Mutex<Option<String>>);

#[tauri::command]
fn initial_file(state: tauri::State<InitialFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Resolve a CLI argument to an absolute path of an existing markdown file.
fn markdown_arg(arg: &str, cwd: &Path) -> Option<String> {
    let path = cwd.join(arg); // join keeps `arg` as-is when it is already absolute
    let is_md = path.extension().map_or(false, |ext| {
        matches!(
            ext.to_str().map(str::to_ascii_lowercase).as_deref(),
            Some("md" | "markdown" | "mkdn" | "mdx")
        )
    });
    (is_md && path.is_file()).then(|| path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cwd = std::env::current_dir().unwrap_or_default();
    let initial = std::env::args().skip(1).find_map(|a| markdown_arg(&a, &cwd));

    tauri::Builder::default()
        .manage(InitialFile(Mutex::new(initial)))
        .invoke_handler(tauri::generate_handler![initial_file])
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // Focus the existing window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
            // If the second instance was invoked with a file argument, open it
            let cwd = PathBuf::from(cwd);
            if let Some(path) = argv.iter().skip(1).find_map(|a| markdown_arg(a, &cwd)) {
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
