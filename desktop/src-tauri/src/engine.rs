//! Starts and stops the bundled Python analysis engine.
//!
//! The engine listens on 127.0.0.1 on a free port and requires a fresh random
//! token on every request. Its stdin is a pipe from this process: when Kiri
//! quits or is killed, the pipe closes and the engine exits by itself.

use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use rand::RngCore;
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Clone, Serialize)]
pub struct EngineInfo {
    pub port: u16,
    pub token: String,
    pub status: &'static str, // "starting" | "ready" | "failed"
    pub message: Option<String>,
}

pub struct EngineState {
    pub info: Mutex<EngineInfo>,
    pub child: Mutex<Option<Child>>,
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0").and_then(|l| l.local_addr()).map(|a| a.port()).unwrap_or(8765)
}

fn token() -> String {
    let mut b = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn engine_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("KIRI_ENGINE_BIN") {
        return Some(PathBuf::from(p));
    }
    let name = if cfg!(windows) { "kiri-engine.exe" } else { "kiri-engine" };
    let res = app.path().resource_dir().ok()?;
    let p = res.join("kiri-engine").join(name);
    p.exists().then_some(p)
}

pub fn init(_app: &AppHandle) -> EngineState {
    let info = EngineInfo { port: free_port(), token: token(), status: "starting", message: None };
    EngineState { info: Mutex::new(info), child: Mutex::new(None) }
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let state = app.state::<EngineState>();
        let (port, tok) = {
            let i = state.info.lock().unwrap();
            (i.port, i.token.clone())
        };
        let fail = |msg: String| {
            log::error!("engine: {msg}");
            let mut i = state.info.lock().unwrap();
            i.status = "failed";
            i.message = Some(msg);
        };
        let Some(bin) = engine_path(&app) else {
            return fail("engine program not found in the app".into());
        };
        let data_dir = match app.path().app_data_dir() {
            Ok(d) => d.join("engine"),
            Err(e) => return fail(format!("no data folder: {e}")),
        };
        let _ = std::fs::create_dir_all(&data_dir);
        let log_dir = app.path().app_log_dir().unwrap_or_else(|_| data_dir.clone());
        let _ = std::fs::create_dir_all(&log_dir);
        let log_file = std::fs::File::create(log_dir.join("engine.log")).ok();

        let mut cmd = Command::new(&bin);
        cmd.env("KIRI_ENGINE_PORT", port.to_string())
            .env("KIRI_DESKTOP_TOKEN", &tok)
            .env("KIRI_DATA_DIR", &data_dir)
            // JSON list: pydantic-settings reads list settings from the environment as JSON.
            .env("CORS_ORIGINS", r#"["tauri://localhost","http://tauri.localhost","http://localhost:1420"]"#)
            .current_dir(&data_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::null());
        match log_file {
            Some(f) => cmd.stderr(Stdio::from(f)),
            None => cmd.stderr(Stdio::null()),
        };
        let child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => return fail(format!("could not start {}: {e}", bin.display())),
        };
        *state.child.lock().unwrap() = Some(child);

        // Wait for /api/health (first start on a Mac unpacks nothing, but imports take a few seconds).
        for _ in 0..240 {
            std::thread::sleep(Duration::from_millis(250));
            if let Some(c) = state.child.lock().unwrap().as_mut() {
                if let Ok(Some(status)) = c.try_wait() {
                    return fail(format!("engine exited early ({status}); see engine.log"));
                }
            }
            if health_ok(port) {
                state.info.lock().unwrap().status = "ready";
                log::info!("engine ready on port {port}");
                return;
            }
        }
        fail("engine did not answer within 60 seconds".into());
    });
}

fn health_ok(port: u16) -> bool {
    use std::io::Write;
    let Ok(mut s) = std::net::TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(300)) else {
        return false;
    };
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    if s.write_all(b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").is_err() {
        return false;
    }
    let mut line = String::new();
    BufReader::new(s).read_line(&mut line).is_ok() && line.contains(" 200 ")
}

pub fn stop(app: &AppHandle) {
    if let Some(state) = app.try_state::<EngineState>() {
        if let Some(mut c) = state.child.lock().unwrap().take() {
            drop(c.stdin.take()); // engine exits when its stdin closes
            std::thread::sleep(Duration::from_millis(300));
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

#[tauri::command]
pub fn engine_info(state: tauri::State<'_, EngineState>) -> EngineInfo {
    state.info.lock().unwrap().clone()
}
