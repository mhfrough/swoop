//! Swoop for desktop.
//!
//! Lives in the tray. Print Screen (or a click on the tray icon, or `swoop --capture`) captures the
//! monitor under the pointer and shows it, frozen, in a full-screen overlay. The shared editor in
//! ui/overlay.html lets you select an area, mark it up, then copy or save it. Nothing is uploaded.

use std::{
    borrow::Cow,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl,
    WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

const OVERLAY: &str = "overlay";
const SETTINGS: &str = "settings";

/// One frozen screen, kept only while the overlay is up.
struct Shot {
    width: u32,
    height: u32,
    scale: f32,
    rgba: Vec<u8>,
}

#[derive(Default)]
struct AppState {
    shot: Mutex<Option<Shot>>,
    /// true from the moment a capture starts until the overlay is hidden again
    busy: Mutex<bool>,
    /// kept alive so Linux clipboards keep serving the image after the overlay closes
    clipboard: Mutex<Option<arboard::Clipboard>>,
    autostart_item: Mutex<Option<CheckMenuItem<Wry>>>,
    print_item: Mutex<Option<CheckMenuItem<Wry>>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Settings {
    save_dir: Option<String>,
    welcomed: bool,
    /// Print Screen opens Swoop (the default). Off gives the key back to Windows or another app.
    #[serde(default = "yes")]
    print_screen: bool,
    /// Windows' Snipping Tool switch before Swoop turned it off: None = Swoop never changed it,
    /// Some(-1) = the value was missing, Some(n) = its old value
    #[serde(default)]
    snip_before: Option<i64>,
}

fn yes() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Settings { save_dir: None, welcomed: false, print_screen: true, snip_before: None }
    }
}

/* ------------------------------------------------------------ settings file */

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn store_settings(app: &AppHandle, s: &Settings) {
    if let Some(p) = settings_path(app) {
        if let Some(dir) = p.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(p, serde_json::to_string_pretty(s).unwrap_or_default());
    }
}

fn save_dir(app: &AppHandle) -> PathBuf {
    if let Some(d) = load_settings(app).save_dir {
        return PathBuf::from(d);
    }
    app.path()
        .picture_dir()
        .or_else(|_| app.path().home_dir().map(|h| h.join("Pictures")))
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("Swoop")
}

/// "name.png", or "name (2).png" when that is taken
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = name.rsplit_once('.').unwrap_or((name, "png"));
    (2..10_000)
        .map(|n| dir.join(format!("{stem} ({n}).{ext}")))
        .find(|p| !p.exists())
        .unwrap_or(first)
}

fn clean_name(raw: &str) -> String {
    let s: String = raw
        .chars()
        .map(|c| if c.is_alphanumeric() || " -_.()".contains(c) { c } else { '-' })
        .collect();
    let s = s.trim().trim_start_matches('.').to_string();
    if s.is_empty() { "Swoop.png".into() } else { s }
}

/* ------------------------------------------------------------ capture */

fn start_capture(app: &AppHandle, delay_ms: u64) {
    {
        let state = app.state::<AppState>();
        let mut busy = state.busy.lock().unwrap();
        if *busy {
            return;
        }
        *busy = true;
    }
    let app = app.clone();
    thread::spawn(move || {
        if delay_ms > 0 {
            thread::sleep(Duration::from_millis(delay_ms));
        }
        if let Err(e) = capture(&app) {
            eprintln!("Swoop: capture failed: {e}");
            *app.state::<AppState>().busy.lock().unwrap() = false;
        }
    });
}

/// The pointer in physical screen pixels. On Windows it is read right here, on the capture thread,
/// rather than through the event loop, so a busy main thread can't make a capture lose it.
#[cfg(windows)]
fn pointer(_app: &AppHandle) -> Option<(i32, i32)> {
    use windows_sys::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};
    let mut p = POINT { x: 0, y: 0 };
    (unsafe { GetCursorPos(&mut p) } != 0).then_some((p.x, p.y))
}
#[cfg(not(windows))]
fn pointer(app: &AppHandle) -> Option<(i32, i32)> {
    app.cursor_position().ok().map(|p| (p.x as i32, p.y as i32))
}

/// The monitor under the pointer, never the one with the active window. A pointer between screens
/// gets the closest one; the primary one only when the pointer can't be read at all (Wayland).
fn monitor_at(point: Option<(i32, i32)>) -> Result<xcap::Monitor, String> {
    let all = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let index = match point {
        Some(p) => {
            let rects: Vec<Rect> = all
                .iter()
                .map(|m| (m.x().unwrap_or(0), m.y().unwrap_or(0), m.width().unwrap_or(0), m.height().unwrap_or(0)))
                .collect();
            nearest(&rects, p)
        }
        None => all.iter().position(|m| m.is_primary().unwrap_or(false)).unwrap_or(0),
    };
    all.into_iter().nth(index).ok_or_else(|| "No screen found".into())
}

/// x, y, width, height
type Rect = (i32, i32, u32, u32);

/// The screen that contains the point, or the closest one to it.
fn nearest(rects: &[Rect], (px, py): (i32, i32)) -> usize {
    let gap = |&(x, y, w, h): &Rect| {
        let (right, bottom) = (x + w as i32 - 1, y + h as i32 - 1);
        let dx = if px < x { x - px } else if px > right { px - right } else { 0 } as i64;
        let dy = if py < y { y - py } else if py > bottom { py - bottom } else { 0 } as i64;
        dx * dx + dy * dy
    };
    (0..rects.len()).min_by_key(|&i| gap(&rects[i])).unwrap_or(0)
}

fn capture(app: &AppHandle) -> Result<(), String> {
    let err = |e: xcap::XCapError| e.to_string();
    let monitor = monitor_at(pointer(app))?;
    let image = monitor.capture_image().map_err(err)?;
    let (x, y) = (monitor.x().map_err(err)?, monitor.y().map_err(err)?);
    let scale = monitor.scale_factor().unwrap_or(1.0).max(0.5);
    let (width, height) = (image.width(), image.height());

    *app.state::<AppState>().shot.lock().unwrap() = Some(Shot { width, height, scale, rgba: image.into_raw() });

    let win = app.get_webview_window(OVERLAY).ok_or("The overlay window is missing")?;
    win.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    win.set_size(PhysicalSize::new(width, height)).map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    let _ = win.set_fullscreen(true);
    // overlay.js fetches the pixels, draws them, then calls overlay_ready to be shown
    app.emit_to(OVERLAY, "capture", ()).map_err(|e| e.to_string())
}

fn hide_overlay_now(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(OVERLAY) {
        let _ = win.hide();
        #[cfg(target_os = "linux")]
        let _ = win.set_fullscreen(false);
    }
    let state = app.state::<AppState>();
    *state.shot.lock().unwrap() = None;
    *state.busy.lock().unwrap() = false;
}

/* ------------------------------------------------------------ commands for the overlay */

/// The frozen screen as raw bytes: width (u32 LE), height (u32 LE), scale (f32 LE), then RGBA.
#[tauri::command]
fn get_capture(state: State<'_, AppState>) -> Result<Response, String> {
    let guard = state.shot.lock().unwrap();
    let shot = guard.as_ref().ok_or("There is no capture to show")?;
    let mut out = Vec::with_capacity(12 + shot.rgba.len());
    out.extend_from_slice(&shot.width.to_le_bytes());
    out.extend_from_slice(&shot.height.to_le_bytes());
    out.extend_from_slice(&shot.scale.to_le_bytes());
    out.extend_from_slice(&shot.rgba);
    Ok(Response::new(out))
}

#[tauri::command]
fn overlay_ready(app: AppHandle) -> Result<(), String> {
    let win = app.get_webview_window(OVERLAY).ok_or("The overlay window is missing")?;
    win.show().map_err(|e| e.to_string())?;
    let _ = win.set_always_on_top(true);
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
fn hide_overlay(app: AppHandle) {
    hide_overlay_now(&app);
}

fn header<T: std::str::FromStr>(req: &Request<'_>, name: &str) -> Result<T, String> {
    req.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| format!("Missing {name}"))
}

/// Raw RGBA in the body, x-width and x-height in the headers.
#[tauri::command]
fn copy_image(request: Request<'_>, state: State<'_, AppState>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected image bytes".into());
    };
    let width: usize = header(&request, "x-width")?;
    let height: usize = header(&request, "x-height")?;
    if bytes.len() != width * height * 4 {
        return Err("The image size does not match its bytes".into());
    }
    let mut cb = state.clipboard.lock().unwrap();
    if cb.is_none() {
        *cb = Some(arboard::Clipboard::new().map_err(|e| e.to_string())?);
    }
    cb.as_mut()
        .unwrap()
        .set_image(arboard::ImageData { width, height, bytes: Cow::Borrowed(bytes) })
        .map_err(|e| e.to_string())
}

/// PNG bytes in the body; x-name is the file name, x-save-as "1" asks where to save.
/// Returns where it was saved, or nothing when "Save as" was cancelled.
#[tauri::command]
async fn save_image(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected image bytes".into());
    };
    let name = clean_name(&header::<String>(&request, "x-name").unwrap_or_else(|_| "Swoop.png".into()));
    let save_as = header::<String>(&request, "x-save-as").map(|v| v == "1").unwrap_or(false);
    let dir = save_dir(&app);
    let path = if save_as {
        // the overlay sits on top of everything, so get it out of the dialog's way first
        hide_overlay_now(&app);
        let _ = fs::create_dir_all(&dir);
        let picked = app
            .dialog()
            .file()
            .set_directory(&dir)
            .set_file_name(&name)
            .add_filter("PNG image", &["png"])
            .blocking_save_file();
        match picked {
            Some(p) => p.into_path().map_err(|e| e.to_string())?,
            None => return Ok(None),
        }
    } else {
        fs::create_dir_all(&dir).map_err(|e| format!("Could not make {}: {e}", dir.display()))?;
        unique_path(&dir, &name)
    };
    fs::write(&path, bytes).map_err(|e| format!("Could not save {}: {e}", path.display()))?;
    Ok(Some(path.display().to_string()))
}

/* ------------------------------------------------------------ commands for the settings window */

#[derive(Serialize)]
struct SettingsView {
    version: String,
    platform: &'static str,
    hotkey_ok: bool,
    print_screen: bool,
    wayland: bool,
    print_screen_taken: bool,
    autostart: bool,
    save_dir: String,
}

#[cfg(windows)]
fn print_screen_taken_by_windows(hotkey_ok: bool) -> bool {
    use winreg::{enums::*, RegKey};
    // Windows 11 gives Print Screen to the Snipping Tool unless this is 0. Newer builds turn it on
    // without writing the value, so when it is missing, a refused hotkey on Windows 11 means the same.
    let value = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Control Panel\\Keyboard")
        .and_then(|k| k.get_value::<u32, _>("PrintScreenKeyForSnippingEnabled"));
    match value {
        Ok(v) => v != 0,
        Err(_) => {
            let build: u32 = RegKey::predef(HKEY_LOCAL_MACHINE)
                .open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion")
                .and_then(|k| k.get_value::<String, _>("CurrentBuildNumber"))
                .ok()
                .and_then(|b| b.parse().ok())
                .unwrap_or(0);
            build >= 22000 && !hotkey_ok
        }
    }
}
#[cfg(not(windows))]
fn print_screen_taken_by_windows(_hotkey_ok: bool) -> bool {
    false
}

/// Takes Print Screen when the setting is on and gives it back when it is off. Called at start-up,
/// when the setting changes, and whenever the settings window asks (so a key another app frees is taken).
/// When another app has registered the key, Windows falls back to a keyboard hook that sees it first.
fn register_hotkey(app: &AppHandle) -> bool {
    let key = Shortcut::new(None, Code::PrintScreen);
    let gs = app.global_shortcut();
    if !load_settings(app).print_screen {
        if gs.is_registered(key) {
            let _ = gs.unregister(key);
        }
        release_print_key();
        snipping_tool(app, false);
        return false;
    }
    snipping_tool(app, true);
    #[cfg(windows)]
    if print_key::installed() {
        return true;
    }
    gs.is_registered(key) || gs.register(key).is_ok() || take_print_key(app)
}

#[cfg(windows)]
fn take_print_key(app: &AppHandle) -> bool {
    print_key::install(app)
}
#[cfg(not(windows))]
fn take_print_key(_app: &AppHandle) -> bool {
    false
}

#[cfg(windows)]
fn release_print_key() {
    print_key::uninstall();
}
#[cfg(not(windows))]
fn release_print_key() {}

/// Windows 11 opens the Snipping Tool on Print Screen. While Swoop has the key that switch is off;
/// turning Swoop's switch off puts Windows' switch back the way it was.
#[cfg(windows)]
fn snipping_tool(app: &AppHandle, swoop_has_key: bool) {
    use winreg::{enums::*, RegKey};
    const NAME: &str = "PrintScreenKeyForSnippingEnabled";
    let Ok((key, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey("Control Panel\\Keyboard") else {
        return;
    };
    let mut s = load_settings(app);
    if swoop_has_key {
        let now = key.get_value::<u32, _>(NAME).ok();
        if now == Some(0) {
            return;
        }
        if s.snip_before.is_none() {
            s.snip_before = Some(now.map(i64::from).unwrap_or(-1));
            store_settings(app, &s);
        }
        let _ = key.set_value(NAME, &0u32);
    } else if let Some(before) = s.snip_before.take() {
        let _ = if before < 0 { key.delete_value(NAME) } else { key.set_value(NAME, &(before as u32)) };
        store_settings(app, &s);
    }
}
#[cfg(not(windows))]
fn snipping_tool(_app: &AppHandle, _swoop_has_key: bool) {}

/// Turns "Print Screen opens Swoop" on or off, from the settings window or the tray.
fn apply_print_screen(app: &AppHandle, on: bool) {
    let mut s = load_settings(app);
    s.print_screen = on;
    store_settings(app, &s);
    register_hotkey(app);
    if let Some(item) = app.state::<AppState>().print_item.lock().unwrap().as_ref() {
        let _ = item.set_checked(on);
    }
}

/// Print Screen through a low-level keyboard hook (Windows only).
/// RegisterHotKey fails while another app (Lightshot, ShareX, Greenshot) holds Print Screen, but a
/// low-level hook sees the key before any registered hotkey does, so Swoop takes it there and swallows
/// it. With Alt, Ctrl, Shift or Win held the key is left alone, so Alt+Print Screen still works.
#[cfg(windows)]
mod print_key {
    use std::sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        mpsc, OnceLock,
    };
    use tauri::AppHandle;
    use windows_sys::Win32::{
        Foundation::{LPARAM, LRESULT, WPARAM},
        System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentThreadId},
        UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT, VK_SNAPSHOT},
        UI::WindowsAndMessaging::{
            CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HC_ACTION,
            KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_QUIT, WM_SYSKEYDOWN,
        },
    };

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static INSTALLED: AtomicBool = AtomicBool::new(false);
    /// the thread that owns the hook, so it can be asked to stop
    static THREAD: AtomicU32 = AtomicU32::new(0);
    /// Swoop took this press (swallow its key-up too)
    static TAKEN: AtomicBool = AtomicBool::new(false);
    /// a press with a modifier, passed on (pass its key-up on too)
    static PASSED: AtomicBool = AtomicBool::new(false);

    pub fn installed() -> bool {
        INSTALLED.load(Ordering::SeqCst)
    }

    fn capture() {
        if let Some(app) = APP.get() {
            super::start_capture(app, 0);
        }
    }

    unsafe extern "system" fn hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code == HC_ACTION as i32 {
            let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
            if kb.vkCode == VK_SNAPSHOT as u32 {
                let down = wparam as u32 == WM_KEYDOWN || wparam as u32 == WM_SYSKEYDOWN;
                if down {
                    let held = |vk: u16| (GetAsyncKeyState(vk as i32) as u16) & 0x8000 != 0;
                    if [VK_MENU, VK_CONTROL, VK_SHIFT, VK_LWIN, VK_RWIN].into_iter().any(held) {
                        PASSED.store(true, Ordering::SeqCst);
                    } else {
                        // key repeat sends more key-downs: capture on the first one only
                        if !TAKEN.swap(true, Ordering::SeqCst) {
                            capture();
                        }
                        return 1;
                    }
                } else if !PASSED.swap(false, Ordering::SeqCst) {
                    // some keyboards send Print Screen as a key-up only
                    if !TAKEN.swap(false, Ordering::SeqCst) {
                        capture();
                    }
                    return 1;
                }
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }

    pub fn install(app: &AppHandle) -> bool {
        if installed() {
            return true;
        }
        let _ = APP.set(app.clone());
        let (tx, rx) = mpsc::channel();
        // the hook runs on the thread that set it, which must keep pumping messages
        std::thread::spawn(move || unsafe {
            let h = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), GetModuleHandleW(std::ptr::null()), 0);
            THREAD.store(GetCurrentThreadId(), Ordering::SeqCst);
            let _ = tx.send(!h.is_null());
            if h.is_null() {
                return;
            }
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {}
            UnhookWindowsHookEx(h);
        });
        let ok = rx.recv().unwrap_or(false);
        INSTALLED.store(ok, Ordering::SeqCst);
        ok
    }

    /// Gives Print Screen back: ends the hook thread, which removes the hook.
    pub fn uninstall() {
        if INSTALLED.swap(false, Ordering::SeqCst) {
            unsafe { PostThreadMessageW(THREAD.load(Ordering::SeqCst), WM_QUIT, 0, 0) };
        }
    }
}

#[tauri::command]
fn get_settings(app: AppHandle) -> SettingsView {
    let hotkey_ok = register_hotkey(&app);
    SettingsView {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS,
        hotkey_ok,
        print_screen: load_settings(&app).print_screen,
        wayland: cfg!(target_os = "linux") && std::env::var_os("WAYLAND_DISPLAY").is_some(),
        print_screen_taken: print_screen_taken_by_windows(hotkey_ok),
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        save_dir: save_dir(&app).display().to_string(),
    }
}

fn apply_autostart(app: &AppHandle, on: bool) -> Result<bool, String> {
    let al = app.autolaunch();
    let res = if on { al.enable() } else { al.disable() };
    res.map_err(|e| e.to_string())?;
    let now = al.is_enabled().unwrap_or(on);
    if let Some(item) = app.state::<AppState>().autostart_item.lock().unwrap().as_ref() {
        let _ = item.set_checked(now);
    }
    Ok(now)
}

#[tauri::command]
fn set_print_screen(app: AppHandle, on: bool) -> SettingsView {
    apply_print_screen(&app, on);
    get_settings(app)
}

#[tauri::command]
fn set_autostart(app: AppHandle, on: bool) -> Result<bool, String> {
    apply_autostart(&app, on)
}

#[tauri::command]
async fn choose_folder(app: AppHandle) -> Option<String> {
    let picked = app.dialog().file().set_directory(save_dir(&app)).blocking_pick_folder()?;
    let path = picked.into_path().ok()?;
    let mut s = load_settings(&app);
    s.save_dir = Some(path.display().to_string());
    store_settings(&app, &s);
    Some(path.display().to_string())
}

fn open_folder_now(app: &AppHandle) {
    let dir = save_dir(app);
    let _ = fs::create_dir_all(&dir);
    let _ = app.opener().open_path(dir.display().to_string(), None::<&str>);
}

#[tauri::command]
fn open_folder(app: AppHandle) {
    open_folder_now(&app);
}

#[tauri::command]
fn open_keyboard_settings(app: AppHandle) {
    let _ = app.opener().open_url("ms-settings:easeofaccess-keyboard", None::<&str>);
}

#[tauri::command]
fn open_link(app: AppHandle, url: String) {
    if url.starts_with("https://") {
        let _ = app.opener().open_url(url, None::<&str>);
    }
}

#[tauri::command]
fn capture_now(app: AppHandle) {
    if let Some(w) = app.get_webview_window(SETTINGS) {
        let _ = w.minimize();
    }
    start_capture(&app, 450);
}

/* ------------------------------------------------------------ tray and windows */

fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SETTINGS) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let app = app.clone();
    // built off the event-loop thread; Tauri hands the work back to it
    thread::spawn(move || {
        let _ = WebviewWindowBuilder::new(&app, SETTINGS, WebviewUrl::App("settings.html".into()))
            .title("Swoop")
            .inner_size(460.0, 700.0)
            .min_inner_size(380.0, 480.0)
            .center()
            .build();
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let autostart_label = if cfg!(windows) { "Start with Windows" } else { "Start when I log in" };
    let capture = MenuItem::with_id(app, "capture", "Capture an area", true, None::<&str>)?;
    let print = CheckMenuItem::with_id(
        app,
        "print",
        "Print Screen opens Swoop",
        true,
        load_settings(app).print_screen,
        None::<&str>,
    )?;
    let folder = MenuItem::with_id(app, "folder", "Open the screenshots folder", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        autostart_label,
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "settings", "Settings and help", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Swoop", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &capture,
            &folder,
            &PredefinedMenuItem::separator(app)?,
            &print,
            &autostart,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    *app.state::<AppState>().autostart_item.lock().unwrap() = Some(autostart);
    *app.state::<AppState>().print_item.lock().unwrap() = Some(print);

    let mut tray = TrayIconBuilder::with_id("swoop")
        .tooltip("Swoop: click to capture an area")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "capture" => start_capture(app, 250),
            "folder" => open_folder_now(app),
            "print" => {
                let on = !load_settings(app).print_screen;
                apply_print_screen(app, on);
            }
            "autostart" => {
                let on = !app.autolaunch().is_enabled().unwrap_or(false);
                let _ = apply_autostart(app, on);
            }
            "settings" => open_settings(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                start_capture(tray.app_handle(), 120);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn setup(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    register_hotkey(app);

    build_tray(app)?;

    // the first time: start with the computer and say hello
    let mut s = load_settings(app);
    if !s.welcomed {
        let _ = app.autolaunch().enable();
        if let Some(item) = app.state::<AppState>().autostart_item.lock().unwrap().as_ref() {
            let _ = item.set_checked(app.autolaunch().is_enabled().unwrap_or(false));
        }
        s.welcomed = true;
        store_settings(app, &s);
        open_settings(app);
    }

    if std::env::args().any(|a| a == "--capture") {
        start_capture(app, 300);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // must come first: a second launch hands its arguments to the copy that is running
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|a| a == "--capture") {
                start_capture(app, 0);
            } else {
                open_settings(app);
            }
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        start_capture(app, 0);
                    }
                })
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_capture,
            overlay_ready,
            hide_overlay,
            copy_image,
            save_image,
            get_settings,
            set_autostart,
            set_print_screen,
            choose_folder,
            open_folder,
            open_keyboard_settings,
            open_link,
            capture_now
        ])
        .setup(|app| setup(app.handle()))
        .on_window_event(|window, event| {
            // the overlay is reused for every capture, so closing it only hides it
            if window.label() == OVERLAY {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    hide_overlay_now(window.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Swoop could not start")
        .run(|_app, event| {
            // keep running in the tray when the settings window closes
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::nearest;

    // a 1920x1080 primary screen with a 2560x1080 screen above it, shifted left (physical pixels)
    const SCREENS: [(i32, i32, u32, u32); 2] = [(0, 0, 1920, 1080), (-305, -1080, 2560, 1080)];

    #[test]
    fn picks_the_screen_under_the_pointer() {
        assert_eq!(nearest(&SCREENS, (960, 540)), 0);
        assert_eq!(nearest(&SCREENS, (1919, 1079)), 0);
        assert_eq!(nearest(&SCREENS, (0, -540)), 1);
        assert_eq!(nearest(&SCREENS, (-305, -1080)), 1);
        assert_eq!(nearest(&SCREENS, (1700, -1)), 1);
        assert_eq!(nearest(&SCREENS, (1700, 0)), 0);
    }

    #[test]
    fn a_pointer_off_every_screen_gets_the_closest() {
        assert_eq!(nearest(&SCREENS, (-200, 500)), 0);
        assert_eq!(nearest(&SCREENS, (2400, -500)), 1);
        assert_eq!(nearest(&[], (0, 0)), 0);
    }
}
