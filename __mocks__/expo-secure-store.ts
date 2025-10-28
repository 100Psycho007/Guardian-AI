const storage = new Map<string, string>();

export async function getItemAsync(key: string) {
  return storage.has(key) ? storage.get(key)! : null;
}

export async function setItemAsync(key: string, value: string) {
  storage.set(key, value);
}

export async function deleteItemAsync(key: string) {
  storage.delete(key);
}

export async function isAvailableAsync() {
  return true;
}

export default {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  isAvailableAsync,
};
