import type { AppData, StoragePort } from "../storage/storage";
import { defaultAppData, parseAppData } from "../storage/storage";

export type AppDataListener = (data: AppData) => void;

export class AppController {
  private data: AppData = structuredClone(defaultAppData);
  private listeners = new Set<AppDataListener>();
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StoragePort) {}

  snapshot(): AppData {
    return structuredClone(this.data);
  }

  subscribe(listener: AppDataListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<AppData> {
    this.data = parseAppData(await this.storage.load());
    this.emit();
    return this.snapshot();
  }

  async update(mutator: (current: AppData) => AppData): Promise<AppData> {
    const next = parseAppData(mutator(this.snapshot()));
    this.data = next;
    this.emit();
    this.saveQueue = this.saveQueue.then(() => this.storage.save(next));
    await this.saveQueue;
    return this.snapshot();
  }

  async moveDataFile(path: string): Promise<AppData> {
    await this.storage.moveTo(path);
    this.data = await this.storage.load();
    this.emit();
    return this.snapshot();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

