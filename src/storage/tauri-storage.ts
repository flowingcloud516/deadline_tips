import { invoke } from "@tauri-apps/api/core";
import type { AppData, StoragePort } from "./storage";
import { parseAppData } from "./storage";

interface LoadResponse {
  data: unknown;
  path: string;
}

export class TauriJsonStorage implements StoragePort {
  async load(): Promise<AppData> {
    const response = await invoke<LoadResponse>("load_app_data");
    const data = parseAppData(response.data);
    return {
      ...data,
      settings: { ...data.settings, dataFilePath: response.path },
    };
  }

  async save(data: AppData): Promise<void> {
    await invoke("save_app_data", { data: parseAppData(data) });
  }

  async moveTo(path: string): Promise<void> {
    await invoke("move_data_file", { newPath: path });
  }

  async exportTo(path: string): Promise<void> {
    await invoke("export_app_data", { destination: path });
  }

  async importFrom(path: string): Promise<AppData> {
    const value = await invoke<unknown>("import_app_data", { source: path });
    return parseAppData(value);
  }
}

