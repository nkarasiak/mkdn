use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

fn build_menu(app: &tauri::App) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    // --- File menu ---
    let file_new = MenuItemBuilder::with_id("file:new", "New")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let file_open = MenuItemBuilder::with_id("file:open", "Open...")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let file_save = MenuItemBuilder::with_id("file:save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let file_save_as = MenuItemBuilder::with_id("file:save-as", "Save As...")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let file_quit = MenuItemBuilder::with_id("file:quit", "Quit")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&file_new)
        .item(&file_open)
        .separator()
        .item(&file_save)
        .item(&file_save_as)
        .separator()
        .item(&file_quit)
        .build()?;

    // --- Edit menu ---
    let edit_undo = PredefinedMenuItem::undo(app, Some("Undo"))?;
    let edit_redo = PredefinedMenuItem::redo(app, Some("Redo"))?;
    let edit_cut = PredefinedMenuItem::cut(app, Some("Cut"))?;
    let edit_copy = PredefinedMenuItem::copy(app, Some("Copy"))?;
    let edit_paste = PredefinedMenuItem::paste(app, Some("Paste"))?;
    let edit_select_all = PredefinedMenuItem::select_all(app, Some("Select All"))?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&edit_undo)
        .item(&edit_redo)
        .separator()
        .item(&edit_cut)
        .item(&edit_copy)
        .item(&edit_paste)
        .separator()
        .item(&edit_select_all)
        .build()?;

    // --- View menu ---
    let view_sidebar = MenuItemBuilder::with_id("view:toggle-sidebar", "Toggle Sidebar")
        .accelerator("CmdOrCtrl+Shift+B")
        .build(app)?;
    let view_source = MenuItemBuilder::with_id("view:toggle-source", "Toggle Source Mode")
        .accelerator("CmdOrCtrl+U")
        .build(app)?;
    let view_zen = MenuItemBuilder::with_id("view:zen-mode", "Zen Mode")
        .accelerator("CmdOrCtrl+Shift+F")
        .build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&view_sidebar)
        .item(&view_source)
        .separator()
        .item(&view_zen)
        .build()?;

    // --- Tools menu ---
    let tools_stats = MenuItemBuilder::with_id("tools:writing-stats", "Writing Statistics")
        .build(app)?;
    let tools_theme = MenuItemBuilder::with_id("tools:theme-editor", "Theme Editor")
        .build(app)?;
    let tools_templates = MenuItemBuilder::with_id("tools:templates", "New from Template")
        .build(app)?;
    let tools_command_palette = MenuItemBuilder::with_id("tools:command-palette", "Command Palette")
        .accelerator("CmdOrCtrl+K")
        .build(app)?;

    let tools_menu = SubmenuBuilder::new(app, "Tools")
        .item(&tools_command_palette)
        .separator()
        .item(&tools_stats)
        .item(&tools_theme)
        .item(&tools_templates)
        .build()?;

    // --- Help menu ---
    let help_shortcuts = MenuItemBuilder::with_id("help:shortcuts", "Keyboard Shortcuts")
        .build(app)?;
    let help_updates = MenuItemBuilder::with_id("help:check-updates", "Check for Updates...")
        .build(app)?;
    let help_about = MenuItemBuilder::with_id("help:about", "About MKDN")
        .build(app)?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&help_shortcuts)
        .separator()
        .item(&help_updates)
        .item(&help_about)
        .build()?;

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&tools_menu)
        .item(&help_menu)
        .build()
}

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

            // Build and set the native menu bar
            let menu = build_menu(app)?;
            app.set_menu(menu)?;

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
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "file:quit" => {
                    app.exit(0);
                }
                _ => {
                    // Forward all other menu events to the frontend as custom events
                    let _ = app.emit("menu-event", id.to_string());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
