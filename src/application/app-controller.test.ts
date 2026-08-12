import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../storage/storage";
import { AppController } from "./app-controller";

describe("AppController", () => {
  it("loads, publishes and persists updates", async () => {
    const storage = new MemoryStorage();
    const controller = new AppController(storage);
    const seen: number[] = [];
    controller.subscribe((data) => seen.push(data.settings.upcomingDays));
    await controller.initialize();
    await controller.update((data) => ({
      ...data,
      settings: { ...data.settings, upcomingDays: 14 },
    }));
    expect(seen).toEqual([7, 7, 14]);
    expect((await storage.load()).settings.upcomingDays).toBe(14);
  });

  it("persists rapid updates in call order", async () => {
    const storage = new MemoryStorage();
    const controller = new AppController(storage);
    await controller.initialize();
    const first = controller.update((data) => ({ ...data, settings: { ...data.settings, upcomingDays: 3 } }));
    const second = controller.update((data) => ({ ...data, settings: { ...data.settings, upcomingDays: 30 } }));
    await Promise.all([first, second]);
    expect((await storage.load()).settings.upcomingDays).toBe(30);
  });
});

