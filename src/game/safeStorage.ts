const STORAGE_WARNING_EVENT = "business-tycoon-storage-warning";
const memoryStorage = new Map<string, string>();
const volatileKeys = new Set<string>();
const removedKeys = new Set<string>();
let storageWarning = false;

export function hasStorageWarning(): boolean {
  return storageWarning;
}

export function readStorageItem(key: string): string | null {
  if (removedKeys.has(key)) return null;
  if (volatileKeys.has(key)) return memoryStorage.get(key) ?? null;
  const storage = getLocalStorage();
  if (storage) {
    try {
      const value = storage.getItem(key);
      if (value !== null) memoryStorage.set(key, value);
      return value ?? memoryStorage.get(key) ?? null;
    } catch (error) {
      notifyStorageWarning(error);
    }
  }
  return memoryStorage.get(key) ?? null;
}

export function writeStorageItem(key: string, value: string): boolean {
  memoryStorage.set(key, value);
  removedKeys.delete(key);
  const storage = getLocalStorage();
  if (!storage) {
    volatileKeys.add(key);
    return false;
  }
  try {
    storage.setItem(key, value);
    volatileKeys.delete(key);
    return true;
  } catch (error) {
    volatileKeys.add(key);
    notifyStorageWarning(error);
    return false;
  }
}

export function removeStorageItem(key: string): boolean {
  memoryStorage.delete(key);
  volatileKeys.delete(key);
  const storage = getLocalStorage();
  if (!storage) {
    removedKeys.add(key);
    return false;
  }
  try {
    storage.removeItem(key);
    removedKeys.delete(key);
    return true;
  } catch (error) {
    removedKeys.add(key);
    notifyStorageWarning(error);
    return false;
  }
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (error) {
    notifyStorageWarning(error);
    return null;
  }
}

function notifyStorageWarning(error: unknown): void {
  if (storageWarning) return;
  storageWarning = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORAGE_WARNING_EVENT, {
      detail: error instanceof Error ? error.name : "StorageUnavailable",
    }));
  }
}
