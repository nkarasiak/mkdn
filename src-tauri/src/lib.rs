use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Focus the existing window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
            // If the second instance was invoked with a file argument, open it
            if let Some(path) = argv.get(1) {
                if path.ends_with(".md")
                    || path.ends_with(".markdown")
                    || path.ends_with(".mkdn")
                    || path.ends_with(".mdx")
                {
                    let _ = app.emit("file-open", path.clone());
                }
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

            // Check CLI args for a file path to open
            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = args.get(1) {
                let path = std::path::Path::new(path);
                if path.exists()
                    && path.extension().map_or(false, |ext| {
                        matches!(ext.to_str(), Some("md" | "markdown" | "mkdn" | "mdx"))
                    })
                {
                    let abs_path = if path.is_absolute() {
                        path.to_path_buf()
                    } else {
                        std::env::current_dir()
                            .unwrap_or_default()
                            .join(path)
                    };
                    let handle = app.handle().clone();
                    let path_str = abs_path.to_string_lossy().to_string();
                    // Emit after a short delay so the webview is ready to listen
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        let _ = handle.emit("file-open", path_str);
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
