import { z } from "zod";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

export const recurrenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("weekly"), weekday: z.number().int().min(1).max(7) }),
  z.object({ kind: z.literal("monthly-day"), day: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal("monthly-before-end"), daysBeforeEnd: z.number().int().min(0).max(30) }),
]);

export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "请输入任务名").max(20, "任务名不能超过 20 个字符"),
  details: z.string(),
  type: z.enum(["one-time", "recurring"]),
  nextDeadline: isoDateSchema,
  // Defaults to false so existing local JSON files remain readable after this
  // attribute was introduced. New and edited tasks always persist the value.
  important: z.boolean().default(false),
  status: z.enum(["pending", "completed", "skipped"]),
  recurrence: recurrenceSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).superRefine((task, context) => {
  if (task.type === "recurring" && task.recurrence === null) {
    context.addIssue({ code: "custom", path: ["recurrence"], message: "周期任务必须设置重复规则" });
  }
  if (task.type === "one-time" && task.recurrence !== null) {
    context.addIssue({ code: "custom", path: ["recurrence"], message: "一次性任务不能设置重复规则" });
  }
});

export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskStatus = Task["status"];
