import { describe, expect, it } from "vitest";
import { defaultAppData, MemoryStorage, parseAppData } from "./storage";

describe("app data validation", () => {
  it("accepts the default schema", () => {
    expect(parseAppData(defaultAppData)).toEqual(defaultAppData);
  });

  it("rejects an unknown schema version", () => {
    expect(() => parseAppData({ ...defaultAppData, schemaVersion: 2 })).toThrow();
  });
});

describe("MemoryStorage", () => {
  it("does not expose mutable internal state", async () => {
    const storage = new MemoryStorage();
    const first = await storage.load();
    first.settings.upcomingDays = 30;
    expect((await storage.load()).settings.upcomingDays).toBe(7);
  });

  it("tracks a configured data path", async () => {
    const storage = new MemoryStorage();
    await storage.moveTo("D:\\deadline-tips\\data.json");
    expect((await storage.load()).settings.dataFilePath).toBe("D:\\deadline-tips\\data.json");
  });

  it("exports and imports independent data snapshots", async () => {
    const storage = new MemoryStorage();
    await storage.exportTo("backup.json");
    const current = await storage.load();
    await storage.save({ ...current, settings: { ...current.settings, upcomingDays: 30 } });

    const imported = await storage.importFrom("backup.json");
    expect(imported.settings.upcomingDays).toBe(7);
    imported.settings.upcomingDays = 14;
    expect((await storage.importFrom("backup.json")).settings.upcomingDays).toBe(7);
  });

  it("rejects an unknown import source", async () => {
    const storage = new MemoryStorage();
    await expect(storage.importFrom("missing.json")).rejects.toThrow("Import source not found");
  });
});

