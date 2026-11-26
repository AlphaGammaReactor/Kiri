//! Update self-test, used only by the release workflow on a real Mac.
//!
//! When KIRI_UPDATE_SELFTEST=<file> is set, Kiri checks the live update feed,
//! downloads and installs the update exactly as the "Restart to update" button
//! does, writes what happened to <file> as JSON, and quits. The workflow then
//! checks that the installed app's version changed.

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

pub fn run(app: AppHandle, out: String) {
    tauri::async_runtime::spawn(async move {
        let current = app.package_info().version.to_string();
        let result = async {
            let updater = app.updater().map_err(|e| e.to_string())?;
            match updater.check().await.map_err(|e| e.to_string())? {
                None => Ok(serde_json::json!({ "current": current, "update": null })),
                Some(u) => {
                    let version = u.version.clone();
                    u.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
                    Ok::<_, String>(serde_json::json!({ "current": current, "update": version, "installed": true }))
                }
            }
        }
        .await;
        let body = match result {
            Ok(v) => v,
            Err(e) => serde_json::json!({ "current": current, "error": e }),
        };
        let _ = std::fs::write(&out, body.to_string());
        app.exit(0);
    });
}
