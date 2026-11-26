//! .kiri files opened from Finder: double-click, "Open With", or the file that launched Kiri.
//! macOS delivers them as RunEvent::Opened. Files that arrive before the window is ready are
//! kept until the interface asks for them.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct Opened(pub Mutex<Vec<String>>);

pub fn received(app: &AppHandle, paths: Vec<String>) {
    let paths: Vec<String> = paths.into_iter().filter(|p| p.to_lowercase().ends_with(".kiri")).collect();
    if paths.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<Opened>() {
        state.0.lock().unwrap().extend(paths.iter().cloned());
    }
    for p in paths {
        let _ = app.emit("kiri://open-file", p);
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
    }
}

/// The interface calls this once when it starts. Later files also arrive as events,
/// so the list is cleared after it is read.
#[tauri::command]
pub fn take_opened_files(state: tauri::State<'_, Opened>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}
