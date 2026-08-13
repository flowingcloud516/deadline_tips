import type { Task } from "../domain/task";
import { z } from "zod";
import { taskSchema } from "../domain/task";

export interface AppSettings {
  upcomingDays: 3 | 7 | 14 | 30;
  alwaysOnTop: boolean;
  launchAtStartup: boolean;
  dataFilePath: string | null;
}

export interface AppData {
  schemaVersion: 1;
  tasks: Task[];
  settings: AppSettings;
  history: unknown[];
}

export interface StoragePort {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  moveTo(path: string): Promise<void>;
  exportTo(path: string): Promise<void>;
  importFrom(path: string): Promise<AppData>;
}

export const appSettingsSchema = z.object({
  upcomingDays: z.union([z.literal(3), z.literal(7), z.literal(14), z.literal(30)]),
  alwaysOnTop: z.boolean(),
  launchAtStartup: z.boolean(),
  dataFilePath: z.string().nullable(),
});

export const appDataSchema = z.object({
  schemaVersion: z.literal(1),
  tasks: z.array(taskSchema),
  settings: appSettingsSchema,
  history: z.array(z.unknown()),
});

export function parseAppData(value: unknown): AppData {
  return appDataSchema.parse(value);
}

export const defaultAppData: AppData = {
  schemaVersion: 1,
  tasks: [],
  settings: {
    upcomingDays: 7,
    alwaysOnTop: true,
    launchAtStartup: false,
    dataFilePath: null,
  },
  history: [],
};

export class MemoryStorage implements StoragePort {
  private data: AppData = structuredClone(defaultAppData);
  private exported = new Map<string, AppData>();

  async load(): Promise<AppData> {
    return structuredClone(this.data);
  }

  async save(data: AppData): Promise<void> {
    this.data = structuredClone(data);
  }

  async moveTo(path: string): Promise<void> {
    this.data.settings.dataFilePath = path;
  }

  async exportTo(path: string): Promise<void> {
    this.exported.set(path, structuredClone(this.data));
  }

  async importFrom(path: string): Promise<AppData> {
    const data = this.exported.get(path);
    if (!data) throw new Error(`Import source not found: ${path}`);
    return structuredClone(data);
  }
}
