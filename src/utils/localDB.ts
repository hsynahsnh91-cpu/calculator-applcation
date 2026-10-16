import type { ConversationTurn } from "../solver/types";
import { isConversationTurn } from "../solver/validation";
import { AppMode, HistoryEntry } from "../types";

const HISTORY_KEY = "pro_calc_history_v2";
const FORMULAS_KEY = "pro_calc_user_formulas";
const SETTINGS_KEY = "pro_calc_settings";
const HISTORY_LIMIT = 150;
const PROFILE_KEY = "pro_calc_profile";
const CONVERSATION_KEY = "pro_calc_conversation_v1";

export interface AppSettings {
  angleMode: "DEG" | "RAD" | "GRAD";
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  theme: "dark";
}

export interface UserFormula {
  id: string;
  name: string;
  category: string;
  expression: string;
  latex: string;
  variables: string[];
  description?: string;
  createdAt: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  angleMode: "DEG",
  soundEnabled: true,
  hapticsEnabled: true,
  theme: "dark",
};

const MODES: AppMode[] = [
  "scientific",
  "equations",
  "sequences",
  "calculus",
  "integration",
  "limits",
  "geometry",
  "probability",
  "matrices",
  "complex",
  "reference",
  "history",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.timestamp === "number" &&
    Number.isFinite(value.timestamp) &&
    MODES.includes(value.mode as AppMode) &&
    typeof value.title === "string" &&
    typeof value.inputLatex === "string" &&
    typeof value.resultLatex === "string" &&
    (value.resultDecimal === undefined ||
      typeof value.resultDecimal === "string") &&
    (value.steps === undefined ||
      (Array.isArray(value.steps) &&
        value.steps.every((step) => typeof step === "string"))) &&
    (value.tags === undefined ||
      (Array.isArray(value.tags) &&
        value.tags.every((tag) => typeof tag === "string"))) &&
    (value.favorite === undefined || typeof value.favorite === "boolean")
  );
}

function isUserFormula(value: unknown): value is UserFormula {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    typeof value.expression === "string" &&
    typeof value.latex === "string" &&
    Array.isArray(value.variables) &&
    value.variables.every((item) => typeof item === "string") &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    (value.description === undefined || typeof value.description === "string")
  );
}

function newestHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  return [...entries]
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, HISTORY_LIMIT);
}

export const localDB = {
  getProfile(): { name: string } {
    try {
      const data: unknown = JSON.parse(
        localStorage.getItem(PROFILE_KEY) || "{}",
      );
      return {
        name:
          isRecord(data) && typeof data.name === "string"
            ? data.name.trim().slice(0, 40)
            : "",
      };
    } catch {
      return { name: "" };
    }
  },
  saveProfile(name: string): void {
    try {
      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({ name: name.trim().slice(0, 40) }),
      );
    } catch {
      /* A private session still works without persistence. */
    }
  },
  getConversation(): ConversationTurn[] {
    try {
      const stored = localStorage.getItem(CONVERSATION_KEY) || "[]";
      if (stored.length > 10_000_000) return [];
      const value: unknown = JSON.parse(stored);
      if (!Array.isArray(value)) return [];
      return value.slice(-24).filter(isConversationTurn);
    } catch {
      return [];
    }
  },
  saveConversation(turns: ConversationTurn[]): void {
    try {
      localStorage.setItem(CONVERSATION_KEY, JSON.stringify(turns.slice(-24)));
    } catch {
      /* A full storage quota never interrupts the current solution. */
    }
  },
  clearConversation(): void {
    try {
      localStorage.removeItem(CONVERSATION_KEY);
    } catch {
      /* Optional persistence. */
    }
  },
  getHistory(): HistoryEntry[] {
    try {
      const data: unknown = JSON.parse(
        localStorage.getItem(HISTORY_KEY) || "[]",
      );
      return Array.isArray(data)
        ? newestHistory(data.filter(isHistoryEntry))
        : [];
    } catch {
      return [];
    }
  },

  saveHistoryEntry(
    entry: Omit<HistoryEntry, "id" | "timestamp">,
  ): HistoryEntry {
    const timestamp = Date.now();
    const fullEntry: HistoryEntry = {
      ...entry,
      id: `h_${timestamp}_${Math.random().toString(36).slice(2, 7).padEnd(5, "0")}`,
      timestamp,
    };
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(
          [fullEntry, ...this.getHistory()].slice(0, HISTORY_LIMIT),
        ),
      );
    } catch {
      // Private browsing and full storage must not interrupt a calculation.
    }
    return fullEntry;
  },

  toggleFavorite(id: string): boolean {
    try {
      const list = this.getHistory();
      const item = list.find((entry) => entry.id === id);
      if (!item) return false;
      item.favorite = !item.favorite;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      return item.favorite;
    } catch {
      return false;
    }
  },

  deleteHistoryEntry(id: string): void {
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(this.getHistory().filter((entry) => entry.id !== id)),
      );
    } catch {
      // Storage may be unavailable in an embedded browser.
    }
  },

  clearHistory(): void {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Storage may be unavailable in an embedded browser.
    }
  },

  getUserFormulas(): UserFormula[] {
    try {
      const data: unknown = JSON.parse(
        localStorage.getItem(FORMULAS_KEY) || "[]",
      );
      return Array.isArray(data) ? data.filter(isUserFormula) : [];
    } catch {
      return [];
    }
  },

  saveUserFormula(formula: Omit<UserFormula, "id" | "createdAt">): UserFormula {
    const full: UserFormula = {
      ...formula,
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
    };
    try {
      localStorage.setItem(
        FORMULAS_KEY,
        JSON.stringify([full, ...this.getUserFormulas()]),
      );
    } catch {
      // Return the formula even if persistent storage is unavailable.
    }
    return full;
  },

  deleteUserFormula(id: string): void {
    try {
      localStorage.setItem(
        FORMULAS_KEY,
        JSON.stringify(
          this.getUserFormulas().filter((formula) => formula.id !== id),
        ),
      );
    } catch {
      // Storage may be unavailable in an embedded browser.
    }
  },

  getSettings(): AppSettings {
    try {
      const data: unknown = JSON.parse(
        localStorage.getItem(SETTINGS_KEY) || "{}",
      );
      if (!isRecord(data)) return { ...DEFAULT_SETTINGS };
      return {
        angleMode:
          data.angleMode === "RAD" || data.angleMode === "GRAD"
            ? data.angleMode
            : "DEG",
        soundEnabled:
          typeof data.soundEnabled === "boolean" ? data.soundEnabled : true,
        hapticsEnabled:
          typeof data.hapticsEnabled === "boolean" ? data.hapticsEnabled : true,
        theme: "dark",
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(settings: Partial<AppSettings>): void {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ ...this.getSettings(), ...settings, theme: "dark" }),
      );
    } catch {
      // Settings are optional when storage is unavailable.
    }
  },

  exportDataJSON(): string {
    try {
      return JSON.stringify(
        {
          history: this.getHistory(),
          formulas: this.getUserFormulas(),
          exportDate: new Date().toISOString(),
        },
        null,
        2,
      );
    } catch {
      return JSON.stringify({
        history: [],
        formulas: [],
        exportDate: new Date().toISOString(),
      });
    }
  },

  importDataJSON(jsonStr: string): boolean {
    try {
      const parsed: unknown = JSON.parse(jsonStr);
      if (
        !isRecord(parsed) ||
        (!("history" in parsed) && !("formulas" in parsed))
      )
        return false;
      if (
        "history" in parsed &&
        (!Array.isArray(parsed.history) ||
          !parsed.history.every(isHistoryEntry))
      )
        return false;
      if (
        "formulas" in parsed &&
        (!Array.isArray(parsed.formulas) ||
          !parsed.formulas.every(isUserFormula))
      )
        return false;

      const previousHistory = localStorage.getItem(HISTORY_KEY);
      const previousFormulas = localStorage.getItem(FORMULAS_KEY);
      try {
        if (Array.isArray(parsed.history)) {
          localStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(newestHistory(parsed.history)),
          );
        }
        if (Array.isArray(parsed.formulas)) {
          localStorage.setItem(FORMULAS_KEY, JSON.stringify(parsed.formulas));
        }
      } catch {
        if (previousHistory === null) localStorage.removeItem(HISTORY_KEY);
        else localStorage.setItem(HISTORY_KEY, previousHistory);
        if (previousFormulas === null) localStorage.removeItem(FORMULAS_KEY);
        else localStorage.setItem(FORMULAS_KEY, previousFormulas);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },
};
