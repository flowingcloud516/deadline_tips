use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent,
};

const DATA_FILE_NAME: &str = "deadline-tips.json";
const LOCATION_FILE_NAME: &str = "data-location.json";
const WIDGET_BOUNDS_FILE_NAME: &str = "widget-bounds.json";
const WIDGET_LABEL: &str = "widget";
const MANAGER_LABEL: &str = "manager";

const TRAY_TOGGLE_WIDGET: &str = "toggle-widget";
const TRAY_OPEN_MANAGER: &str = "open-manager";
const TRAY_QUIT: &str = "quit";

/// The persisted document intentionally remains a JSON value at the Tauri boundary.
/// The TypeScript domain layer owns the detailed task schema; the Rust layer guards
/// the stable envelope so future schema migrations have a single entry point.
#[derive(Debug, Clone, Serialize)]
struct LoadResponse {
    data: Value,
    path: String,
}

#[derive(Debug, Deserialize)]
struct DataLocation {
    path: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WidgetBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

struct DataStore {
    default_path: PathBuf,
    location_path: PathBuf,
    active_path: Mutex<PathBuf>,
}

impl DataStore {
    fn for_app(app: &tauri::AppHandle) -> Result<Self, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("无法确定应用数据目录: {error}"))?;
        fs::create_dir_all(&app_data_dir)
            .map_err(|error| format!("无法创建应用数据目录: {error}"))?;

        let default_path = app_data_dir.join(DATA_FILE_NAME);
        let location_path = app_data_dir.join(LOCATION_FILE_NAME);
        let active_path = read_location(&location_path)
            .filter(|path| path.is_absolute())
            .unwrap_or_else(|| default_path.clone());

        Ok(Self {
            default_path,
            location_path,
            active_path: Mutex::new(active_path),
        })
    }

    fn active_path(&self) -> Result<PathBuf, String> {
        self.active_path
            .lock()
            .map(|path| path.clone())
            .map_err(|_| "数据存储锁不可用".to_string())
    }

    fn set_active_path(&self, path: PathBuf) -> Result<(), String> {
        *self
            .active_path
            .lock()
            .map_err(|_| "数据存储锁不可用".to_string())? = path;
        Ok(())
    }
}

fn default_app_data() -> Value {
    json!({
        "schemaVersion": 1,
        "tasks": [],
        "settings": {
            "upcomingDays": 7,
            "alwaysOnTop": true,
            "launchAtStartup": false,
            "dataFilePath": null
        },
        "history": []
    })
}

fn validate_app_data(data: Value) -> Result<Value, String> {
    let object = data
        .as_object()
        .ok_or_else(|| "数据文件根节点必须是对象".to_string())?;

    if object.get("schemaVersion") != Some(&Value::from(1)) {
        return Err("不支持的数据版本；当前只支持 schemaVersion = 1".to_string());
    }
    if !object.get("tasks").is_some_and(Value::is_array) {
        return Err("数据文件缺少 tasks 数组".to_string());
    }
    if !object.get("history").is_some_and(Value::is_array) {
        return Err("数据文件缺少 history 数组".to_string());
    }
    if !object.get("settings").is_some_and(Value::is_object) {
        return Err("数据文件缺少 settings 对象".to_string());
    }

    Ok(data)
}

fn load_data(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(default_app_data());
    }

    let text = fs::read_to_string(path)
        .map_err(|error| format!("无法读取数据文件 {}: {error}", path.display()))?;
    let data =
        serde_json::from_str(&text).map_err(|error| format!("数据文件不是有效 JSON: {error}"))?;
    validate_app_data(data)
}

fn with_storage_path(mut data: Value, path: &Path) -> Result<Value, String> {
    validate_app_data(data.clone())?;
    let settings = data
        .get_mut("settings")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "数据文件缺少 settings 对象".to_string())?;
    settings.insert(
        "dataFilePath".to_string(),
        Value::String(path.to_string_lossy().into_owned()),
    );
    Ok(data)
}

fn temporary_path(destination: &Path) -> Result<PathBuf, String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "数据文件路径必须包含父目录".to_string())?;
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "数据文件路径必须包含文件名".to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("无法生成临时文件名: {error}"))?
        .as_nanos();
    Ok(parent.join(format!(".{file_name}.{nonce}.tmp")))
}

/// Flushes a complete document beside its destination and renames it only after the
/// temporary file is durable. A failed write or rename leaves the old destination
/// untouched; stale temporary files are best-effort cleaned up.
fn write_json_atomic(destination: &Path, data: &Value) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "数据文件路径必须包含父目录".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("无法创建数据目录 {}: {error}", parent.display()))?;

    let serialized =
        serde_json::to_vec_pretty(data).map_err(|error| format!("无法序列化数据: {error}"))?;
    let temporary = temporary_path(destination)?;
    let write_result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("无法创建临时数据文件: {error}"))?;
        file.write_all(&serialized)
            .map_err(|error| format!("无法写入临时数据文件: {error}"))?;
        file.write_all(b"\n")
            .map_err(|error| format!("无法完成临时数据文件: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("无法同步临时数据文件: {error}"))?;
        drop(file);
        fs::rename(&temporary, destination)
            .map_err(|error| format!("无法用临时数据文件替换 {}: {error}", destination.display()))
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}

fn read_location(location_path: &Path) -> Option<PathBuf> {
    let text = fs::read_to_string(location_path).ok()?;
    let location: DataLocation = serde_json::from_str(&text).ok()?;
    let path = PathBuf::from(location.path);
    path.is_absolute().then_some(path)
}

fn write_location(location_path: &Path, active_path: &Path) -> Result<(), String> {
    write_json_atomic(
        location_path,
        &json!({ "path": active_path.to_string_lossy() }),
    )
}

fn clear_location(location_path: &Path) -> Result<(), String> {
    if location_path.exists() {
        fs::remove_file(location_path).map_err(|error| {
            format!("无法清除数据路径配置 {}: {error}", location_path.display())
        })?;
    }
    Ok(())
}

fn widget_bounds_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法确定应用数据目录: {error}"))?
        .join(WIDGET_BOUNDS_FILE_NAME))
}

fn restore_widget_bounds(app: &AppHandle) -> Result<(), String> {
    let path = widget_bounds_path(app)?;
    let Ok(contents) = fs::read_to_string(path) else {
        return Ok(());
    };
    let Ok(bounds) = serde_json::from_str::<WidgetBounds>(&contents) else {
        return Ok(());
    };
    let widget = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or_else(|| "找不到悬浮窗".to_string())?;

    // Ignore malformed or implausible values rather than restoring an unusable window.
    if bounds.width >= 360 && bounds.height >= 360 && bounds.width <= 4096 && bounds.height <= 4096
    {
        // Migrate the exact legacy default size to the compact transparent widget.
        // Preserve every other size because it may be an intentional user choice.
        let (width, height) = if bounds.width == 480 && bounds.height == 720 {
            (480, 430)
        } else {
            (bounds.width, bounds.height)
        };
        let _ = widget.set_size(PhysicalSize::new(width, height));
        let _ = widget.set_position(PhysicalPosition::new(bounds.x, bounds.y));
    }
    Ok(())
}

fn persist_widget_bounds(app: &AppHandle, widget: &WebviewWindow) -> Result<(), String> {
    let position = widget
        .outer_position()
        .map_err(|error| format!("无法读取悬浮窗位置: {error}"))?;
    let size = widget
        .outer_size()
        .map_err(|error| format!("无法读取悬浮窗尺寸: {error}"))?;
    let bounds = WidgetBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    let path = widget_bounds_path(app)?;
    write_json_atomic(
        &path,
        &serde_json::to_value(bounds).map_err(|error| format!("无法序列化悬浮窗尺寸: {error}"))?,
    )
}

fn show_widget(app: &AppHandle) -> Result<(), String> {
    let widget = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or_else(|| "找不到悬浮窗".to_string())?;
    widget
        .show()
        .map_err(|error| format!("无法显示悬浮窗: {error}"))?;
    widget
        .set_focus()
        .map_err(|error| format!("无法聚焦悬浮窗: {error}"))
}

fn toggle_widget(app: &AppHandle) -> Result<(), String> {
    let widget = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or_else(|| "找不到悬浮窗".to_string())?;
    if widget
        .is_visible()
        .map_err(|error| format!("无法读取悬浮窗状态: {error}"))?
    {
        widget
            .hide()
            .map_err(|error| format!("无法隐藏悬浮窗: {error}"))
    } else {
        show_widget(app)
    }
}

fn open_task_manager_window(app: &AppHandle) -> Result<(), String> {
    let manager = app
        .get_webview_window(MANAGER_LABEL)
        .ok_or_else(|| "找不到任务管理窗口".to_string())?;
    manager
        .show()
        .map_err(|error| format!("无法显示任务管理窗口: {error}"))?;
    manager
        .set_focus()
        .map_err(|error| format!("无法聚焦任务管理窗口: {error}"))
}

fn install_window_lifecycle(app: &AppHandle) -> Result<(), String> {
    for label in [WIDGET_LABEL, MANAGER_LABEL] {
        let window = app
            .get_webview_window(label)
            .ok_or_else(|| format!("找不到窗口: {label}"))?;
        let app_handle = app.clone();
        let label = label.to_string();
        window.on_window_event(move |event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if let Some(window) = app_handle.get_webview_window(&label) {
                    let _ = window.hide();
                }
            }
            WindowEvent::Moved(_) | WindowEvent::Resized(_) if label == WIDGET_LABEL => {
                if let Some(window) = app_handle.get_webview_window(WIDGET_LABEL) {
                    let _ = persist_widget_bounds(&app_handle, &window);
                }
            }
            _ => {}
        });
    }
    Ok(())
}

fn install_tray(app: &AppHandle) -> Result<(), String> {
    let toggle = MenuItem::with_id(
        app,
        TRAY_TOGGLE_WIDGET,
        "显示 / 隐藏悬浮窗",
        true,
        None::<&str>,
    )
    .map_err(|error| format!("无法创建托盘菜单: {error}"))?;
    let manager = MenuItem::with_id(app, TRAY_OPEN_MANAGER, "打开任务管理", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单: {error}"))?;
    let separator =
        PredefinedMenuItem::separator(app).map_err(|error| format!("无法创建托盘菜单: {error}"))?;
    let quit = MenuItem::with_id(app, TRAY_QUIT, "退出 Deadline Tips", true, None::<&str>)
        .map_err(|error| format!("无法创建托盘菜单: {error}"))?;
    let menu = Menu::with_items(app, &[&toggle, &manager, &separator, &quit])
        .map_err(|error| format!("无法创建托盘菜单: {error}"))?;

    TrayIconBuilder::with_id("deadline-tips-tray")
        .icon(
            app.default_window_icon()
                .cloned()
                .ok_or_else(|| "找不到应用图标".to_string())?,
        )
        .tooltip("Deadline Tips")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_TOGGLE_WIDGET => {
                let _ = toggle_widget(app);
            }
            TRAY_OPEN_MANAGER => {
                let _ = open_task_manager_window(app);
            }
            TRAY_QUIT => app.exit(0),
            _ => {}
        })
        .build(app)
        .map_err(|error| format!("无法创建系统托盘图标: {error}"))?;
    Ok(())
}

#[tauri::command]
fn load_app_data(store: tauri::State<'_, DataStore>) -> Result<LoadResponse, String> {
    let path = store.active_path()?;
    let data = with_storage_path(load_data(&path)?, &path)?;
    Ok(LoadResponse {
        data,
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn save_app_data(store: tauri::State<'_, DataStore>, data: Value) -> Result<(), String> {
    let path = store.active_path()?;
    write_json_atomic(&path, &with_storage_path(data, &path)?)
}

#[tauri::command]
fn get_data_file_path(store: tauri::State<'_, DataStore>) -> Result<String, String> {
    Ok(store.active_path()?.to_string_lossy().into_owned())
}

#[tauri::command]
fn move_data_file(store: tauri::State<'_, DataStore>, new_path: String) -> Result<String, String> {
    let destination = PathBuf::from(new_path);
    if !destination.is_absolute() {
        return Err("数据文件路径必须是绝对路径".to_string());
    }
    if destination.file_name().is_none() {
        return Err("数据文件路径必须包含文件名".to_string());
    }

    let source = store.active_path()?;
    if source == destination {
        return Ok(destination.to_string_lossy().into_owned());
    }

    // Write the full new document first. The active path and location marker remain
    // unchanged until this succeeds, so a migration failure never abandons the source.
    let data = with_storage_path(load_data(&source)?, &destination)?;
    write_json_atomic(&destination, &data)?;

    if destination == store.default_path {
        clear_location(&store.location_path)?;
    } else {
        write_location(&store.location_path, &destination)?;
    }
    store.set_active_path(destination.clone())?;

    // Deleting the old copy is intentionally best-effort. A locked or removable-drive
    // source cannot make an otherwise successful migration lose either version.
    if source.exists() {
        let _ = fs::remove_file(source);
    }
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
fn export_app_data(store: tauri::State<'_, DataStore>, destination: String) -> Result<(), String> {
    let destination = PathBuf::from(destination);
    if !destination.is_absolute() {
        return Err("导出路径必须是绝对路径".to_string());
    }
    let source = store.active_path()?;
    write_json_atomic(&destination, &load_data(&source)?)
}

#[tauri::command]
fn import_app_data(source: String) -> Result<Value, String> {
    let source = PathBuf::from(source);
    if !source.is_absolute() {
        return Err("导入路径必须是绝对路径".to_string());
    }
    load_data(&source)
}

#[tauri::command]
fn open_task_manager(app: AppHandle) -> Result<(), String> {
    open_task_manager_window(&app)
}

#[tauri::command]
fn hide_task_manager(app: AppHandle) -> Result<(), String> {
    let manager = app
        .get_webview_window(MANAGER_LABEL)
        .ok_or_else(|| "task manager window is unavailable".to_string())?;
    manager.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn show_deadline_widget(app: AppHandle) -> Result<(), String> {
    show_widget(&app)
}

#[tauri::command]
fn start_widget_drag(app: AppHandle) -> Result<(), String> {
    let widget = app
        .get_webview_window(WIDGET_LABEL)
        .ok_or_else(|| "找不到悬浮窗".to_string())?;
    #[cfg(target_os = "windows")]
    {
        use std::ffi::c_void;
        type Hwnd = *mut c_void;
        const WM_NCLBUTTONDOWN: u32 = 0x00A1;
        const HTCAPTION: usize = 2;
        #[link(name = "user32")]
        unsafe extern "system" {
            fn ReleaseCapture() -> i32;
            fn SendMessageW(hwnd: Hwnd, message: u32, wparam: usize, lparam: isize) -> isize;
        }

        let hwnd = widget
            .hwnd()
            .map_err(|error| format!("无法获取悬浮窗句柄: {error}"))?;
        unsafe {
            ReleaseCapture();
            SendMessageW(hwnd.0 as Hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        widget
            .start_dragging()
            .map_err(|error| format!("无法拖动悬浮窗: {error}"))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let store = DataStore::for_app(app.handle())?;
            app.manage(store);
            restore_widget_bounds(app.handle())?;
            install_window_lifecycle(app.handle())?;
            install_tray(app.handle())?;
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            load_app_data,
            save_app_data,
            get_data_file_path,
            move_data_file,
            export_app_data,
            import_app_data,
            open_task_manager,
            hide_task_manager,
            show_deadline_widget,
            start_widget_drag
        ])
        .run(tauri::generate_context!())
        .expect("error while running Deadline Tips");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "deadline-tips-{name}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        path
    }

    #[test]
    fn default_document_uses_schema_version_one() {
        let data = default_app_data();
        assert_eq!(data["schemaVersion"], 1);
        assert!(validate_app_data(data).is_ok());
    }

    #[test]
    fn rejects_unknown_schema_versions() {
        let mut data = default_app_data();
        data["schemaVersion"] = json!(2);
        assert!(validate_app_data(data).is_err());
    }

    #[test]
    fn atomic_write_replaces_complete_document() {
        let directory = test_directory("atomic-write");
        let target = directory.join("data.json");
        write_json_atomic(&target, &json!({ "version": 1 })).expect("first write");
        write_json_atomic(&target, &json!({ "version": 2 })).expect("replace write");

        let stored: Value = serde_json::from_str(&fs::read_to_string(&target).unwrap()).unwrap();
        assert_eq!(stored["version"], 2);
        assert!(!fs::read_dir(&directory).unwrap().any(|entry| entry
            .unwrap()
            .path()
            .extension()
            .is_some_and(|ext| ext == "tmp")));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn location_round_trip_requires_an_absolute_path() {
        let directory = test_directory("location");
        let location = directory.join("location.json");
        let target = directory.join("chosen-data.json");
        write_location(&location, &target).expect("location write");
        assert_eq!(read_location(&location), Some(target));
        fs::remove_dir_all(directory).unwrap();
    }
}
