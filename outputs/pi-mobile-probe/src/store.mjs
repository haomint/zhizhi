export function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('zhizhi-pi-probe', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onerror = () => reject(new Error('无法打开本地验证数据库'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve({
        get(key) { return new Promise((yes, no) => { const r = db.transaction('records').objectStore('records').get(key); r.onsuccess = () => yes(r.result); r.onerror = () => no(new Error('读取本地记录失败')); }); },
        put(key, value) { return new Promise((yes, no) => { const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put(value, key); tx.oncomplete = () => yes(); tx.onerror = tx.onabort = () => no(new Error('本地写入失败，未显示保存成功')); }); },
      });
    };
  });
}
