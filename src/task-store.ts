import * as fs from "fs";
import * as path from "path";
import { Task, Board } from "./types";

export class TaskStore {
  private readonly tasksDir: string;
  private readonly boardPath: string;

  constructor(hlaviDir: string) {
    this.tasksDir = path.join(hlaviDir, "tasks");
    this.boardPath = path.join(hlaviDir, "board.json");
  }

  loadBoard(): Board | null {
    if (!fs.existsSync(this.boardPath)) return null;
    try {
      const raw = fs.readFileSync(this.boardPath, "utf-8");
      return JSON.parse(raw) as Board;
    } catch {
      return null;
    }
  }

  /** Returns the board-level default model, or null if not configured. */
  getBoardModel(): string | null {
    return this.loadBoard()?.config?.model ?? null;
  }

  loadAll(): Task[] {
    if (!fs.existsSync(this.tasksDir)) {
      return [];
    }
    return fs
      .readdirSync(this.tasksDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const raw = fs.readFileSync(path.join(this.tasksDir, f), "utf-8");
        return JSON.parse(raw) as Task;
      });
  }

  save(task: Task): void {
    const filePath = path.join(this.tasksDir, `${task.id}.json`);
    task.updated_at = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(task, null, 4));
  }

  getAutonomousOpenTasks(): Task[] {
    return this.loadAll().filter(
      (t) => t.autonomous && t.status === "open"
    );
  }
}
