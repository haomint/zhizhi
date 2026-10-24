export interface ReadingState {
  page: number;
  preference: string;
  successfulRuns: number;
  lastResult: string;
}
const initial: ReadingState = { page: 0, preference: '', successfulRuns: 0, lastResult: '' };
let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('zhizhi-react-ts-probe', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('reading');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地存储'));
  });
  return database;
}
function isReadingState(value: unknown): value is ReadingState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return Number.isInteger(v.page) && Number(v.page) >= 0 && Number(v.page) < 3 &&
    typeof v.preference === 'string' && Number.isInteger(v.successfulRuns) && Number(v.successfulRuns) >= 0 &&
    typeof v.lastResult === 'string';
}
export async function load(): Promise<ReadingState> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('reading').objectStore('reading').get('current');
    request.onsuccess = () => {
      const value: unknown = request.result;
      if (value === undefined) resolve({ ...initial });
      else if (isReadingState(value)) resolve(value);
      else reject(new Error('本地数据格式不兼容，未覆盖原始记录'));
    };
    request.onerror = () => reject(request.error ?? new Error('读取失败'));
  });
}
export async function save(value: ReadingState): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reading', 'readwrite');
    tx.objectStore('reading').put(value, 'current');
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('保存失败'));
  });
}
