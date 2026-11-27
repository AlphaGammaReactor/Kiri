mod engine;
mod files;
mod selftest;

use tauri::{Manager, RunEvent};

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![engine::engine_info, files::take_opened_files])
        .manage(files::Opened::default())
        .setup(|app| {
            let handle = app.handle().clone();
            if let Ok(out) = std::env::var("KIRI_UPDATE_SELFTEST") {
                selftest::run(handle, out);
                return Ok(());
            }
            // Windows and Linux pass an opened file as a command-line argument.
            let args: Vec<String> = std::env::args().skip(1).collect();
            files::received(&handle, args);
            app.manage(engine::init(&handle));
            engine::start(handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kiri");

    app.run(|handle, event| match event {
        RunEvent::Exit => engine::stop(handle),
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            let paths = urls.iter().filter_map(|u| u.to_file_path().ok()).map(|p| p.to_string_lossy().into_owned()).collect();
            files::received(handle, paths);
        }
        _ => {}
    });
}
