import {
  defaultSolverSettings,
  knowledgeItemSchema,
  solverSettingsSchema,
  type KnowledgeItem,
  type SolverSettings,
} from "./types";

const DB_NAME = "syrian-math-admin";
const DB_VERSION = 1;
const ITEMS_STORE = "items";
const PREFERENCES_STORE = "preferences";
const SETTINGS_KEY = "solver-settings";
const PROMPT_KEY = "engine-prompt";

interface PreferenceRecord {
  key: string;
  value: unknown;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("فشل طلب التخزين المحلي."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("تعذّر حفظ البيانات المحلية."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("أُلغيت عملية التخزين المحلي."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("لا يدعم هذا المتصفح قاعدة البيانات المحلية المطلوبة للمسودات."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ITEMS_STORE))
        database.createObjectStore(ITEMS_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(PREFERENCES_STORE))
        database.createObjectStore(PREFERENCES_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("تعذّر فتح قاعدة المسودات المحلية."));
  });
  return databasePromise;
}

async function getPreference(key: string): Promise<unknown> {
  const database = await openDatabase();
  const transaction = database.transaction(PREFERENCES_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(PREFERENCES_STORE).get(key),
  );
  await transactionDone(transaction);
  if (
    record !== null &&
    typeof record === "object" &&
    "value" in record &&
    typeof (record as PreferenceRecord).key === "string"
  )
    return (record as PreferenceRecord).value;
  return undefined;
}

async function setPreference(key: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PREFERENCES_STORE, "readwrite");
  transaction.objectStore(PREFERENCES_STORE).put({ key, value } satisfies PreferenceRecord);
  await transactionDone(transaction);
}

export const adminDraftDB = {
  async getItems(): Promise<KnowledgeItem[]> {
    const database = await openDatabase();
    const transaction = database.transaction(ITEMS_STORE, "readonly");
    const values = await requestResult(
      transaction.objectStore(ITEMS_STORE).getAll(),
    );
    await transactionDone(transaction);
    return values
      .map((value) => knowledgeItemSchema.safeParse(value))
      .filter((result) => result.success)
      .map((result) => result.data)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  },

  async putItem(item: KnowledgeItem): Promise<void> {
    const parsed = knowledgeItemSchema.parse(item);
    const database = await openDatabase();
    const transaction = database.transaction(ITEMS_STORE, "readwrite");
    transaction.objectStore(ITEMS_STORE).put(parsed);
    await transactionDone(transaction);
  },

  async putItems(items: KnowledgeItem[]): Promise<void> {
    const parsed = items.map((item) => knowledgeItemSchema.parse(item));
    const database = await openDatabase();
    const transaction = database.transaction(ITEMS_STORE, "readwrite");
    const store = transaction.objectStore(ITEMS_STORE);
    parsed.forEach((item) => store.put(item));
    await transactionDone(transaction);
  },

  async deleteItem(id: string): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(ITEMS_STORE, "readwrite");
    transaction.objectStore(ITEMS_STORE).delete(id);
    await transactionDone(transaction);
  },

  async replaceItems(items: KnowledgeItem[]): Promise<void> {
    const parsed = items.map((item) => knowledgeItemSchema.parse(item));
    const database = await openDatabase();
    const transaction = database.transaction(ITEMS_STORE, "readwrite");
    const store = transaction.objectStore(ITEMS_STORE);
    store.clear();
    parsed.forEach((item) => store.put(item));
    await transactionDone(transaction);
  },

  async getSettings(): Promise<SolverSettings> {
    const stored = await getPreference(SETTINGS_KEY);
    const parsed = solverSettingsSchema.safeParse(stored);
    if (!parsed.success) return { ...defaultSolverSettings };
    return {
      ...parsed.data,
      disabledEngines: parsed.data.disabledEngines.filter(
        (engine): engine is SolverSettings["disabledEngines"][number] =>
          [
            "mathEngine",
            "equationSolver",
            "sequences",
            "calculusEngine",
            "limitsEngine",
            "integrationEngine",
            "geometryEngine",
            "geometryTools",
            "matricesEngine",
            "probabilityEngine",
            "probabilityTools",
            "complexEngine",
            "complexTools",
          ].includes(engine),
      ),
    };
  },

  async saveSettings(settings: SolverSettings): Promise<void> {
    await setPreference(SETTINGS_KEY, solverSettingsSchema.parse(settings));
  },

  async getPrompt(): Promise<string | undefined> {
    const value = await getPreference(PROMPT_KEY);
    return typeof value === "string" && value.trim() ? value : undefined;
  },

  async savePrompt(prompt: string): Promise<void> {
    await setPreference(PROMPT_KEY, prompt.trim().slice(0, 24_000));
  },
};
