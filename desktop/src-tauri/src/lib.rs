mod engine;
mod selftest;

use tauri::{Manager, RunEvent};

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![engine::engine_info])
        .setup(|app| {
            let handle = app.handle().clone();
            if let Ok(out) = std::env::var("KIRI_UPDATE_SELFTEST") {
                selftest::run(handle, out);
                return Ok(());
            }
            app.manage(engine::init(&handle));
            engine::start(handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Kiri");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            engine::stop(handle);
        }
    });
}
