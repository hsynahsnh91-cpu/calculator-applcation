import { HistoryEntry } from '../types';

const HISTORY_KEY = 'pro_calc_history_v2';
const FORMULAS_KEY = 'pro_calc_user_formulas';
const SETTINGS_KEY = 'pro_calc_settings';

export interface AppSettings {
  angleMode: 'DEG' | 'RAD' | 'GRAD';
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  theme: 'dark' | 'light' | 'amoled';
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

export const localDB = {
  // History Methods
  getHistory(): HistoryEntry[] {
    try {
      const data = localStorage.getItem(HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveHistoryEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): HistoryEntry {
    const fullEntry: HistoryEntry = {
      ...entry,
      id: 'h_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: Date.now()
    };
    try {
      const list = this.getHistory();
      const updated = [fullEntry, ...list].slice(0, 150); // keep up to 150 entries
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch {
      // storage full or disabled
    }
    return fullEntry;
  },

  toggleFavorite(id: string): boolean {
    const list = this.getHistory();
    const item = list.find(h => h.id === id);
    if (item) {
      item.favorite = !item.favorite;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      return item.favorite;
    }
    return false;
  },

  deleteHistoryEntry(id: string) {
    const list = this.getHistory().filter(h => h.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  },

  clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
  },

  // User Formulas
  getUserFormulas(): UserFormula[] {
    try {
      const data = localStorage.getItem(FORMULAS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveUserFormula(formula: Omit<UserFormula, 'id' | 'createdAt'>): UserFormula {
    const full: UserFormula = {
      ...formula,
      id: 'f_' + Date.now(),
      createdAt: Date.now()
    };
    const list = this.getUserFormulas();
    list.unshift(full);
    localStorage.setItem(FORMULAS_KEY, JSON.stringify(list));
    return full;
  },

  deleteUserFormula(id: string) {
    const list = this.getUserFormulas().filter(f => f.id !== id);
    localStorage.setItem(FORMULAS_KEY, JSON.stringify(list));
  },

  // Settings
  getSettings(): AppSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : { angleMode: 'DEG', soundEnabled: true, hapticsEnabled: true, theme: 'dark' };
    } catch {
      return { angleMode: 'DEG', soundEnabled: true, hapticsEnabled: true, theme: 'dark' };
    }
  },

  saveSettings(settings: Partial<AppSettings>) {
    try {
      const current = this.getSettings();
      const updated = { ...current, ...settings };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  },

  // Export / Import
  exportDataJSON(): string {
    const data = {
      history: this.getHistory(),
      formulas: this.getUserFormulas(),
      exportDate: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  },

  importDataJSON(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.history)) {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(parsed.history));
      }
      if (Array.isArray(parsed.formulas)) {
        localStorage.setItem(FORMULAS_KEY, JSON.stringify(parsed.formulas));
      }
      return true;
    } catch {
      return false;
    }
  }
};
