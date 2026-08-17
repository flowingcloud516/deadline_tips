import { isTauri } from "@tauri-apps/api/core";
import type { StoragePort } from "./storage";
import { MemoryStorage } from "./storage";
import { TauriJsonStorage } from "./tauri-storage";

export function createStorage(): StoragePort {
  if (isTauri()) return new TauriJsonStorage();
  const storage = new MemoryStorage();
  void storage.save({
    schemaVersion: 1,
    tasks: [
      {
        id: "browser-sample",
        title: "浏览器测试任务",
        details: "仅用于本地界面自动检查",
        type: "one-time",
        nextDeadline: "2026-08-20",
        important: false,
        status: "pending",
        recurrence: null,
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-12T00:00:00.000Z"
      }
    ],
    settings: { upcomingDays: 7, alwaysOnTop: true, launchAtStartup: false, dataFilePath: null, dailyShowTime: "10:00" },
    history: []
  });
  return storage;
}
