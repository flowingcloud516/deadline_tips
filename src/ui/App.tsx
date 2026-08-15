import { useCallback, useEffect, useMemo, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open as chooseOpenPath, save as chooseSavePath } from "@tauri-apps/plugin-dialog";
import { TaskService } from "../application/task-service";
import { queryWidgetTaskSections, type TaskDeadlineSummary } from "../application/task-queries";
import type { Task } from "../domain/task";
import { createStorage } from "../storage/create-storage";
import { TaskManagerPanel } from "./manager/TaskManagerPanel";
import type { TaskFormValue } from "./manager/manager-model";
import { formatDeadline } from "./widget-model";
import { localDateString, millisecondsUntilNextHour } from "./widget-clock";

const storage = createStorage();
const taskService = new TaskService(storage);
const DATA_CHANGED_EVENT = "deadline-tips://data-changed";

export function App() {
  const managerWindow = isTauri()
    ? getCurrentWindow().label === "manager"
    : new URLSearchParams(window.location.search).get("window") === "manager";
  return managerWindow ? <ManagerApp /> : <WidgetApp />;
}

function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTasks(await taskService.list());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    if (!isTauri()) return;
    let dispose: (() => void) | undefined;
    void listen(DATA_CHANGED_EVENT, () => void reload()).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, [reload]);

  return { tasks, loading, error, reload };
}

function WidgetApp() {
  const [isExpanded, setIsExpanded] = useState(true);
  const { tasks, loading, error } = useTasks();
  const today = useLocalToday();
  const sections = useMemo(() => queryWidgetTaskSections(tasks, today, 7), [tasks, today]);
  const openManager = async () => {
    if (isTauri()) await invoke("open_task_manager");
  };
  const startDragging = async () => {
    if (!isTauri()) return;
    try {
      await invoke("start_widget_drag");
    } catch {
      await getCurrentWindow().startDragging();
    }
  };

  return <main className="prototype-shell">
    <section className="widget" aria-label="截止日期悬浮窗">
      <div className="widget__topbar" data-tauri-drag-region onMouseDown={(event) => { if (event.button === 0 && !(event.target as HTMLElement).closest("button")) void startDragging(); }}>
        <div className="widget__title" data-tauri-drag-region><p className="eyebrow" data-tauri-drag-region>DEADLINE TIPS</p></div>
        <button className="icon-button" type="button" aria-expanded={isExpanded} aria-label={isExpanded ? "收起任务列表" : "展开任务列表"} onClick={() => setIsExpanded((value) => !value)}>{isExpanded ? "−" : "+"}</button>
      </div>
      {loading && <p className="empty-state">正在读取本地任务…</p>}
      {error && <p className="error-state" role="alert">无法读取任务：{error}</p>}
      {!loading && !error && isExpanded && <div className="widget__content">
        <TaskSection title="近期即将到期" subtitle={`未来 7 天 · ${sections.upcoming.length} 项`} emptyText="未来 7 天没有普通待办任务" tasks={sections.upcoming} type="upcoming" />
        <TaskSection title="周期任务" subtitle={`${sections.recurring.length} 项持续关注`} emptyText="暂时没有待完成的周期任务" tasks={sections.recurring} type="recurring" />
        <TaskSection title="重要任务" subtitle={`${sections.important.length} 项重点关注`} emptyText="暂时没有重要任务" tasks={sections.important} type="important" />
      </div>}
      <footer className="widget__footer"><span>{sections.upcoming.length + sections.recurring.length + sections.important.length} 项正在关注</span><button type="button" onClick={() => void openManager()}>任务管理</button></footer>
    </section>
  </main>;
}

function ManagerApp() {
  const { tasks, loading, error, reload } = useTasks();
  const today = useLocalToday();
  const [dataFilePath, setDataFilePath] = useState("");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ path: string; data: Awaited<ReturnType<typeof storage.importFrom>> } | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<string>("get_data_file_path").then(setDataFilePath).catch((reason) => setStorageMessage(String(reason)));
  }, []);
  const mutate = async (operation: () => Promise<unknown>) => {
    await operation();
    await reload();
    if (isTauri()) await emit(DATA_CHANGED_EVENT);
  };
  const create = (value: TaskFormValue) => mutate(() => taskService.create(value));
  const update = (id: string, value: TaskFormValue) => mutate(() => taskService.update(id, value));
  const remove = (id: string) => mutate(() => taskService.delete(id));
  const close = async () => {
    if (!isTauri()) return;
    await invoke("hide_task_manager");
  };
  const chooseDataFile = async () => {
    if (!isTauri()) return;
    setStorageMessage(null);
    try {
      const selected = await chooseSavePath({ title: "选择 Deadline Tips 数据文件位置", defaultPath: dataFilePath || "deadline-tips.json", filters: [{ name: "JSON 数据文件", extensions: ["json"] }] });
      if (!selected) return;
      const normalized = selected.toLowerCase().endsWith(".json") ? selected : `${selected}.json`;
      await storage.moveTo(normalized);
      setDataFilePath(normalized);
      setStorageMessage("数据文件已迁移到新位置。后续修改将保存到该文件。");
      await reload();
      await emit(DATA_CHANGED_EVENT);
    } catch (reason) {
      setStorageMessage(`无法更改数据文件位置：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };
  const exportData = async () => {
    if (!isTauri()) return;
    setStorageMessage(null);
    try {
      const selected = await chooseSavePath({ title: "导出 Deadline Tips 数据", defaultPath: "deadline-tips-backup.json", filters: [{ name: "JSON 数据文件", extensions: ["json"] }] });
      if (!selected) return;
      const normalized = selected.toLowerCase().endsWith(".json") ? selected : `${selected}.json`;
      await storage.exportTo(normalized);
      setStorageMessage(`数据已导出到：${normalized}`);
    } catch (reason) {
      setStorageMessage(`无法导出数据：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };
  const chooseImport = async () => {
    if (!isTauri()) return;
    setStorageMessage(null);
    try {
      const selected = await chooseOpenPath({ title: "导入 Deadline Tips 数据", multiple: false, directory: false, filters: [{ name: "JSON 数据文件", extensions: ["json"] }] });
      if (!selected) return;
      const imported = await storage.importFrom(selected);
      setPendingImport({ path: selected, data: imported });
    } catch (reason) {
      setStorageMessage(`无法导入数据：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };
  const confirmImport = async () => {
    if (!pendingImport) return;
    try {
      await storage.save(pendingImport.data);
      const importedPath = pendingImport.path;
      setPendingImport(null);
      await reload();
      await emit(DATA_CHANGED_EVENT);
      setStorageMessage(`已从 ${importedPath} 导入数据。当前数据文件位置未改变。`);
    } catch (reason) {
      setStorageMessage(`无法导入数据：${reason instanceof Error ? reason.message : String(reason)}`);
      setPendingImport(null);
    }
  };

  if (loading) return <main className="manager-loading">正在读取本地任务…</main>;
  if (error) return <main className="manager-loading" role="alert">无法读取任务：{error}</main>;
  return <TaskManagerPanel tasks={tasks} today={today} dataFilePath={dataFilePath} storageMessage={storageMessage} onChooseDataFile={chooseDataFile} onExportData={exportData} onChooseImport={chooseImport} pendingImport={pendingImport ? { path: pendingImport.path, taskCount: pendingImport.data.tasks.length } : null} onCancelImport={() => setPendingImport(null)} onConfirmImport={confirmImport} onCreate={create} onUpdate={update} onDelete={remove} onClose={close} />;
}

function TaskSection({ title, subtitle, emptyText, tasks, type }: { title: string; subtitle: string; emptyText: string; tasks: TaskDeadlineSummary[]; type: "upcoming" | "recurring" | "important" }) {
  return <section className="task-section" aria-label={title}><div className="section-heading"><h2>{title}</h2><span>{subtitle}</span></div>{tasks.length === 0 ? <p className="empty-state">{emptyText}</p> : <div className="task-list">{tasks.map((task) => <TaskCard key={task.task.id} task={task} type={type} />)}</div>}</section>;
}

function TaskCard({ task, type }: { task: TaskDeadlineSummary; type: "upcoming" | "recurring" | "important" }) {
  const urgent = type === "important" && task.daysRemaining <= 7;
  const countdown = task.daysRemaining === 0 ? "今天到期" : task.daysRemaining < 0 ? `已逾期 ${Math.abs(task.daysRemaining)} 天` : `还有 ${task.daysRemaining} 天`;
  const recurring = task.task.type === "recurring";
  const occurrenceCountdown = task.occurrenceDaysRemaining === 0
    ? "下一次任务就在今天"
    : task.occurrenceDaysRemaining === null
      ? "截止前没有下一次任务"
      : `下一次任务还有 ${task.occurrenceDaysRemaining} 天`;
  return <article className={`task-card ${urgent ? "task-card--important-near" : ""}`}><span className={`status-dot ${urgent ? "status-dot--important" : ""}`} aria-hidden="true" /><div className="task-card__body"><div className="task-card__title-row"><strong title={task.task.title}>{task.task.title}</strong>{type === "important" && <span className="important-badge">重要</span>}</div><span>{recurring ? `结束日期：${formatDeadline(task.task.nextDeadline)}` : formatDeadline(task.task.nextDeadline)}</span>{recurring && task.nextOccurrence && <span>下一次：{formatDeadline(task.nextOccurrence)}</span>}</div><div className={`countdown ${urgent ? "countdown--important" : ""}`}>{recurring ? <><strong>{occurrenceCountdown}</strong><span>{task.daysRemaining < 0 ? `已截止 ${Math.abs(task.daysRemaining)} 天` : task.daysRemaining === 0 ? "今天整体截止" : `距截止还有 ${task.daysRemaining} 天`}</span></> : <><strong>{countdown}</strong>{type === "important" && <span>约 {task.weeksRemaining.toFixed(1)} 周</span>}</>}</div></article>;
}

function useLocalToday(): string {
  const [today, setToday] = useState(() => localDateString(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => setToday(localDateString(new Date()));
    const schedule = () => {
      const now = new Date();
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, millisecondsUntilNextHour(now));
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    schedule();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return today;
}
