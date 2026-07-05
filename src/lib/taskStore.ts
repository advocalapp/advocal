/**
 * Lightweight cross-screen task store.
 * tasks.tsx writes here whenever its task list changes.
 * calendar.tsx reads the reminder count + list from here.
 */

export interface StoredTask {
  id: string;
  title: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  done: boolean;
  /** Smart date label: "Today" | "Tomorrow" | "22 Jun 2024" */
  dueLabel: string;
  /** Raw ISO date string — used for pre-filling the edit form */
  rawDate?: string;
  /** Time string for display: "11:00 AM" */
  reminderTime?: string;
  /** Location / court / venue entered by user */
  location?: string;
  /** Notes / description entered by user */
  description?: string;
  /** Repeat frequency: "Does not repeat" | "Daily" | "Weekly" | "Monthly" | "Yearly" */
  repeat?: string;
  caseRef?: string;
  reminderAt?: Date | null;
  reminderAdvance?: number;
}

type Listener = () => void;

let _tasks: StoredTask[] = [];
const _listeners = new Set<Listener>();

export function setStoreTasks(tasks: StoredTask[]) {
  _tasks = tasks;
  _listeners.forEach((fn) => fn());
}

export function getStoreTasks(): StoredTask[] {
  return _tasks;
}

export function getReminderTasks(): StoredTask[] {
  return _tasks.filter((t) => !t.done && t.reminderAt != null);
}

export function subscribeStore(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
