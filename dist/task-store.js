"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class TaskStore {
    constructor(hlaviDir) {
        this.tasksDir = path.join(hlaviDir, "tasks");
        this.boardPath = path.join(hlaviDir, "board.json");
    }
    loadBoard() {
        if (!fs.existsSync(this.boardPath))
            return null;
        try {
            const raw = fs.readFileSync(this.boardPath, "utf-8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    /** Returns the board-level default model, or null if not configured. */
    getBoardModel() {
        return this.loadBoard()?.config?.model ?? null;
    }
    loadAll() {
        if (!fs.existsSync(this.tasksDir)) {
            return [];
        }
        return fs
            .readdirSync(this.tasksDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => {
            const raw = fs.readFileSync(path.join(this.tasksDir, f), "utf-8");
            return JSON.parse(raw);
        });
    }
    save(task) {
        const filePath = path.join(this.tasksDir, `${task.id}.json`);
        task.updated_at = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(task, null, 4));
    }
    getAutonomousOpenTasks() {
        return this.loadAll().filter((t) => t.autonomous && t.status === "open");
    }
}
exports.TaskStore = TaskStore;
