import { useMemo, useState, type FormEvent } from "react";
import type { Task } from "../../domain/task";
import {
  createTaskFormDraft,
  defaultTaskManagerFilters,
  displayStatus,
  draftFromTask,
  filterAndSortTasks,
  toTaskFormValue,
  validateTaskForm,
  type ImportantFilter,
  type TaskFormDraft,
  type TaskFormErrors,
  type TaskFormValue,
  type TaskManagerFilters,
  type TaskStatusFilter,
  type TaskTypeFilter,
} from "./manager-model";

export interface TaskManagerPanelProps {
  tasks: readonly Task[];
  /** Local YYYY-MM-DD date supplied by the application shell. */
  today: string;
  onCreate: (value: TaskFormValue) => void | Promise<void>;
  onUpdate: (taskId: string, value: TaskFormValue) => void | Promise<void>;
  onDelete: (taskId: string) => void | Promise<void>;
  dataFilePath?: string;
  storageMessage?: string | null;
  onChooseDataFile?: () => void | Promise<void>;
  onExportData?: () => void | Promise<void>;
  onChooseImport?: () => void | Promise<void>;
  pendingImport?: { path: string; taskCount: number } | null;
  onCancelImport?: () => void;
  onConfirmImport?: () => void | Promise<void>;
  onClose?: () => void;
}

type Editor = { taskId: string; draft: TaskFormDraft } | null;

export function TaskManagerPanel({ tasks, today, onCreate, onUpdate, onDelete, dataFilePath, storageMessage, onChooseDataFile, onExportData, onChooseImport, pendingImport, onCancelImport, onConfirmImport, onClose }: TaskManagerPanelProps) {
  const [filters, setFilters] = useState<TaskManagerFilters>(defaultTaskManagerFilters);
  const [editor, setEditor] = useState<Editor>(null);
  const [newTaskDraft, setNewTaskDraft] = useState<TaskFormDraft | null>(null);
  const [newTaskSubmitAttempted, setNewTaskSubmitAttempted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const visibleTasks = useMemo(() => filterAndSortTasks(tasks, filters), [tasks, filters]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    const value = toTaskFormValue(editor.draft);
    if (!value) return;
    void onUpdate(editor.taskId, value);
    setEditor(null);
  };

  const submitNewTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTaskDraft) return;
    const value = toTaskFormValue(newTaskDraft);
    if (!value) { setNewTaskSubmitAttempted(true); return; }
    await onCreate(value);
    setNewTaskDraft(null);
    setNewTaskSubmitAttempted(false);
  };

  return (
    <main className="task-manager" aria-label="任务管理">
      <header className="task-manager__header">
        <div><p className="eyebrow">DEADLINE TIPS</p><h1>任务管理</h1></div>
        <div className="task-manager__header-actions">
          {onClose && <button type="button" aria-label="关闭任务管理" onClick={onClose}>关闭</button>}
        </div>
      </header>

      {onChooseDataFile && <section className="task-manager__storage" aria-label="数据与备份">
        <div><strong>数据文件位置</strong><code title={dataFilePath}>{dataFilePath || "正在读取…"}</code></div>
        <div className="task-manager__storage-actions">
          <button type="button" onClick={() => void onChooseDataFile()}>更改位置</button>
          {onChooseImport && <button type="button" onClick={() => void onChooseImport()}>导入 JSON</button>}
          {onExportData && <button type="button" onClick={() => void onExportData()}>导出 JSON</button>}
        </div>
        {storageMessage && <p role="status">{storageMessage}</p>}
      </section>}
      <TaskFilters filters={filters} onChange={setFilters} />
      <p className="task-manager__count">共 {visibleTasks.length} 项，按截止日期排序</p>
      <div className="task-manager__table-wrap">
        <table className="task-manager__table">
          <thead><tr><th>ID</th><th>任务</th><th>详情</th><th>类型 / 规则</th><th>截止日期</th><th>重要</th><th>状态</th><th>创建时间</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>
            {visibleTasks.map((task) => <TaskRow key={task.id} task={task} today={today} onEdit={() => setEditor({ taskId: task.id, draft: draftFromTask(task) })} onDelete={() => setDeleteTarget(task)} />)}
            {visibleTasks.length === 0 && <tr><td colSpan={10} className="task-manager__empty">没有符合筛选条件的任务。</td></tr>}
            {newTaskDraft
              ? <InlineTaskCreateRow draft={newTaskDraft} showErrors={newTaskSubmitAttempted} onChange={setNewTaskDraft} onCancel={() => { setNewTaskDraft(null); setNewTaskSubmitAttempted(false); }} onSubmit={submitNewTask} />
              : <tr className="task-manager__add-row"><td colSpan={10}><button type="button" onClick={() => setNewTaskDraft(createTaskFormDraft(today))}>＋ 新增任务</button></td></tr>}
          </tbody>
        </table>
      </div>

      {editor && <TaskEditor editor={editor} onCancel={() => setEditor(null)} onSubmit={submit} onChange={(draft) => setEditor({ ...editor, draft })} />}
      {deleteTarget && <DeleteConfirmation task={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={() => { void onDelete(deleteTarget.id); setDeleteTarget(null); }} />}
      {pendingImport && onCancelImport && onConfirmImport && <ImportConfirmation path={pendingImport.path} taskCount={pendingImport.taskCount} onCancel={onCancelImport} onConfirm={onConfirmImport} />}
    </main>
  );
}

function ImportConfirmation({ path, taskCount, onCancel, onConfirm }: { path: string; taskCount: number; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return <section className="task-manager__dialog" role="alertdialog" aria-modal="true" aria-labelledby="import-title"><div>
    <h2 id="import-title">覆盖当前数据？</h2>
    <p>已验证所选 JSON，其中包含 {taskCount} 项任务。继续后将用它覆盖当前任务和设置；当前数据文件的位置不会改变。</p>
    <code className="task-manager__import-path" title={path}>{path}</code>
    <p>建议先导出当前数据作为备份。</p>
    <div className="task-manager__dialog-actions"><button type="button" onClick={onCancel}>取消</button><button type="button" className="task-manager__danger-button" onClick={() => void onConfirm()}>确认导入并覆盖</button></div>
  </div></section>;
}

function TaskFilters({ filters, onChange }: { filters: TaskManagerFilters; onChange: (filters: TaskManagerFilters) => void }) {
  return <section className="task-manager__filters" aria-label="任务筛选">
    <FilterSelect label="筛选状态" value={filters.status} onChange={(status) => onChange({ ...filters, status: status as TaskStatusFilter })} options={[["all", "全部状态"], ["pending", "待完成"], ["completed", "已完成"], ["skipped", "已跳过"]]} />
    <FilterSelect label="筛选类型" value={filters.type} onChange={(type) => onChange({ ...filters, type: type as TaskTypeFilter })} options={[["all", "全部类型"], ["one-time", "一次性"], ["recurring", "周期性"]]} />
    <FilterSelect label="任务重要性" value={filters.important} onChange={(important) => onChange({ ...filters, important: important as ImportantFilter })} options={[["all", "全部任务"], ["important", "重要任务"], ["ordinary", "普通任务"]]} />
  </section>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}

function TaskRow({ task, today, onEdit, onDelete }: { task: Task; today: string; onEdit: () => void; onDelete: () => void }) {
  const status = displayStatus(task, today);
  return <tr>
    <td>{task.id}</td><td>{task.title}</td><td>{task.details || "—"}</td><td>{task.type === "one-time" ? "一次性" : recurrenceLabel(task)}</td><td>{task.nextDeadline}</td>
    <td>{task.important ? "重要" : "普通"}</td><td>{statusLabel(status)}</td><td>{task.createdAt}</td><td>{task.updatedAt}</td>
    <td><button type="button" onClick={onEdit}>编辑</button><button type="button" onClick={onDelete}>删除</button></td>
  </tr>;
}

function TaskEditor({ editor, onCancel, onSubmit, onChange }: { editor: Exclude<Editor, null>; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onChange: (draft: TaskFormDraft) => void }) {
  const errors = validateTaskForm(editor.draft);
  const update = <K extends keyof TaskFormDraft>(key: K, value: TaskFormDraft[K]) => onChange({ ...editor.draft, [key]: value });
  const recurring = editor.draft.type === "recurring";
  return <section className="task-manager__dialog" role="dialog" aria-modal="true" aria-labelledby="task-editor-title">
    <form onSubmit={onSubmit} noValidate><h2 id="task-editor-title">编辑任务</h2>
      <label>任务名称<input value={editor.draft.title} maxLength={20} onChange={(event) => update("title", event.target.value)} />{errors.title && <small role="alert">{errors.title}</small>}</label>
      <label>任务详情<textarea value={editor.draft.details} onChange={(event) => update("details", event.target.value)} /></label>
      <label>任务类型<select aria-label="任务类型" value={editor.draft.type} onChange={(event) => update("type", event.target.value as Task["type"])}><option value="one-time">一次性</option><option value="recurring">周期性</option></select></label>
      <DateField value={editor.draft.nextDeadline} onChange={(value) => update("nextDeadline", value)} error={errors.nextDeadline} />
      <label>任务状态<select aria-label="任务状态" value={editor.draft.status} onChange={(event) => update("status", event.target.value as Task["status"])}><option value="pending">待完成</option><option value="completed">已完成</option><option value="skipped">已跳过</option></select></label>
      <label className="task-manager__important-check"><input type="checkbox" aria-label="标记为重要任务" checked={editor.draft.important} onChange={(event) => update("important", event.target.checked)} /><span>标记为重要任务</span></label>
      {recurring && <RecurrenceFields draft={editor.draft} errors={errors} update={update} />}
      <div className="task-manager__dialog-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit">保存</button></div>
    </form>
  </section>;
}

/** An editable row keeps routine task creation in the table rather than a modal. */
function InlineTaskCreateRow({
  draft, showErrors, onChange, onCancel, onSubmit,
}: {
  draft: TaskFormDraft;
  showErrors: boolean;
  onChange: (draft: TaskFormDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const errors = showErrors ? validateTaskForm(draft) : {};
  const update = <K extends keyof TaskFormDraft>(key: K, value: TaskFormDraft[K]) => onChange({ ...draft, [key]: value });
  const recurring = draft.type === "recurring";

  return <tr className="task-manager__inline-create">
    <td aria-label="新任务">新任务</td>
    <td><label className="sr-only" htmlFor="inline-task-title">任务名称</label><input id="inline-task-title" autoFocus value={draft.title} maxLength={20} placeholder="任务名称" onChange={(event) => update("title", event.target.value)} />{errors.title && <small role="alert">{errors.title}</small>}</td>
    <td><label className="sr-only" htmlFor="inline-task-details">任务详情</label><textarea id="inline-task-details" value={draft.details} placeholder="详情（可选）" onChange={(event) => update("details", event.target.value)} /></td>
    <td className="task-manager__inline-rule">
      <label className="sr-only" htmlFor="inline-task-type">任务类型</label><select id="inline-task-type" value={draft.type} onChange={(event) => update("type", event.target.value as Task["type"])}><option value="one-time">一次性</option><option value="recurring">周期性</option></select>
      {recurring && <details open><summary>设置重复规则</summary><InlineRecurrenceFields draft={draft} errors={errors} update={update} /></details>}
    </td>
    <td><DateField id="inline-task-deadline" compact value={draft.nextDeadline} onChange={(value) => update("nextDeadline", value)} error={errors.nextDeadline} /></td>
    <td><label className="task-manager__inline-check"><input aria-label="标记为重要任务" type="checkbox" checked={draft.important} onChange={(event) => update("important", event.target.checked)} />重要</label></td>
    <td><label className="sr-only" htmlFor="inline-task-status">任务状态</label><select id="inline-task-status" value={draft.status} onChange={(event) => update("status", event.target.value as Task["status"])}><option value="pending">待完成</option><option value="completed">已完成</option><option value="skipped">已跳过</option></select></td>
    <td aria-hidden="true">—</td><td aria-hidden="true">—</td>
    <td><form onSubmit={onSubmit} noValidate className="task-manager__inline-actions"><button type="submit">保存</button><button type="button" onClick={onCancel}>取消</button></form></td>
  </tr>;
}

function DateField({ id = "task-deadline", value, onChange, error, compact = false }: { id?: string; value: string; onChange: (value: string) => void; error?: string; compact?: boolean }) {
  return <label className={`task-manager__date-field ${compact ? "task-manager__date-field--compact" : ""}`} htmlFor={id}>
    {!compact && <span>截止日期</span>}
    <input id={id} type="date" value={value} aria-describedby={`${id}-hint`} onChange={(event) => onChange(event.target.value)} />
    <small id={`${id}-hint`} className="task-manager__date-hint">可点击日历选择；手动输入请使用 YYYY-MM-DD</small>
    {error && <small role="alert">{error}</small>}
  </label>;
}

function InlineRecurrenceFields({ draft, errors, update }: { draft: TaskFormDraft; errors: TaskFormErrors; update: <K extends keyof TaskFormDraft>(key: K, value: TaskFormDraft[K]) => void }) {
  return <div className="task-manager__inline-recurrence-fields">
    <label>规则<select value={draft.recurrenceKind} onChange={(event) => update("recurrenceKind", event.target.value as TaskFormDraft["recurrenceKind"])}><option value="weekly">每周</option><option value="monthly-day">每月固定日</option><option value="monthly-before-end">月末前 n 天</option></select></label>
    {draft.recurrenceKind === "weekly" && <label>星期<select value={draft.weekday} onChange={(event) => update("weekday", event.target.value)}>{["一", "二", "三", "四", "五", "六", "日"].map((day, index) => <option key={day} value={index + 1}>星期{day}</option>)}</select>{errors.weekday && <small role="alert">{errors.weekday}</small>}</label>}
    {draft.recurrenceKind === "monthly-day" && <label>日期<input type="number" min="1" max="31" value={draft.monthlyDay} onChange={(event) => update("monthlyDay", event.target.value)} />{errors.monthlyDay && <small role="alert">{errors.monthlyDay}</small>}</label>}
    {draft.recurrenceKind === "monthly-before-end" && <label>月末前<input aria-label="月末前天数" type="number" min="0" max="30" value={draft.daysBeforeEnd} onChange={(event) => update("daysBeforeEnd", event.target.value)} />天{errors.daysBeforeEnd && <small role="alert">{errors.daysBeforeEnd}</small>}</label>}
  </div>;
}

function RecurrenceFields({ draft, errors, update }: { draft: TaskFormDraft; errors: TaskFormErrors; update: <K extends keyof TaskFormDraft>(key: K, value: TaskFormDraft[K]) => void }) {
  return <fieldset><legend>重复规则</legend>
    <label>规则<select value={draft.recurrenceKind} onChange={(event) => update("recurrenceKind", event.target.value as TaskFormDraft["recurrenceKind"])}><option value="weekly">每周</option><option value="monthly-day">每月固定日</option><option value="monthly-before-end">月末前 n 天</option></select></label>
    {draft.recurrenceKind === "weekly" && <label>星期<select value={draft.weekday} onChange={(event) => update("weekday", event.target.value)}>{["一", "二", "三", "四", "五", "六", "日"].map((day, index) => <option key={day} value={index + 1}>星期{day}</option>)}</select>{errors.weekday && <small role="alert">{errors.weekday}</small>}</label>}
    {draft.recurrenceKind === "monthly-day" && <label>日期<input type="number" min="1" max="31" value={draft.monthlyDay} onChange={(event) => update("monthlyDay", event.target.value)} />{errors.monthlyDay && <small role="alert">{errors.monthlyDay}</small>}</label>}
    {draft.recurrenceKind === "monthly-before-end" && <label>月末前天数<input aria-label="月末前天数" type="number" min="0" max="30" value={draft.daysBeforeEnd} onChange={(event) => update("daysBeforeEnd", event.target.value)} />天{errors.daysBeforeEnd && <small role="alert">{errors.daysBeforeEnd}</small>}</label>}
  </fieldset>;
}

function DeleteConfirmation({ task, onCancel, onConfirm }: { task: Task; onCancel: () => void; onConfirm: () => void }) {
  return <section className="task-manager__dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><div><h2 id="delete-title">删除任务？</h2><p>“{task.title}”将从本地数据中删除，且无法恢复。</p><div className="task-manager__dialog-actions"><button type="button" onClick={onCancel}>取消</button><button type="button" onClick={onConfirm}>确认删除</button></div></div></section>;
}

function recurrenceLabel(task: Task): string {
  if (!task.recurrence) return "周期性";
  if (task.recurrence.kind === "weekly") return `每周星期${["一", "二", "三", "四", "五", "六", "日"][task.recurrence.weekday - 1]}`;
  if (task.recurrence.kind === "monthly-day") return `每月 ${task.recurrence.day} 日`;
  return `月末前 ${task.recurrence.daysBeforeEnd} 天`;
}

function statusLabel(status: ReturnType<typeof displayStatus>): string {
  return ({ pending: "待完成", completed: "已完成", skipped: "已跳过", overdue: "已逾期" })[status];
}
