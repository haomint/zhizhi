import type { AppDocument } from "../contracts.ts";
export interface Repository {
  read(): Promise<unknown>;
  write(document: AppDocument): Promise<void>;
  legacyCard?(): Promise<unknown>;
}
export class IndexedDBRepository implements Repository {
  private database: Promise<IDBDatabase>;
  private factory: IDBFactory;
  constructor(factory: IDBFactory = indexedDB) {
    this.factory = factory;
    this.database = new Promise((resolve, reject) => {
      const request = factory.open("zhizhi-app", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("state"))
          request.result.createObjectStore("state");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || Error("无法打开本地资料库"));
    });
  }
  async read(): Promise<unknown> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const request = db
        .transaction("state")
        .objectStore("state")
        .get("document");
      request.onsuccess = () => resolve(request.result as unknown);
      request.onerror = () =>
        reject(request.error || Error("无法读取学习资料"));
    });
  }
  async write(document: AppDocument): Promise<void> {
    const db = await this.database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(document, "document");
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(tx.error || Error("本地保存失败，请重试"));
    });
  }
  async legacyCard(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open("zhizhi-personal", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("cards"))
          request.result.createObjectStore("cards");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction("cards").objectStore("cards").get("latest");
        read.onsuccess = () => {
          db.close();
          resolve(read.result as unknown);
        };
        read.onerror = () => {
          db.close();
          reject(read.error);
        };
      };
    });
  }
}
