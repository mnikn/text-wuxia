/**
 * 双缓冲原子写 + 槽位（票据 007）：
 * 每个槽位两个缓冲区（A/B），写入先写非活动区、回读校验通过后切指针；
 * 读档先读活动区，损坏自动回退备用区，双份皆毁才判损坏。
 * KV 抽象：浏览器为 IndexedDB + localStorage 指针；Node 测试注入内存实现。
 */
import { parseAndMigrate, toPackage, type SavePackage } from "./contract";
import type { GameState } from "../engine/state";

export interface KV {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type SlotId = "auto" | "m1" | "m2" | "m3";
export const SLOTS: SlotId[] = ["auto", "m1", "m2", "m3"];
export const SLOT_LABEL: Record<SlotId, string> = {
  auto: "自动存档",
  m1: "手动槽一",
  m2: "手动槽二",
  m3: "手动槽三",
};

export class SaveStore {
  constructor(
    private data: KV,
    private ptr: KV
  ) {}

  private bufKey(slot: SlotId, buf: "A" | "B"): string {
    return `save:${slot}:${buf}`;
  }

  /** 双缓冲原子写 */
  async write(state: GameState, slot: SlotId): Promise<void> {
    const pkg = toPackage(state);
    const text = JSON.stringify(pkg);
    const current = ((await this.ptr.get(slot)) as "A" | "B" | undefined) ?? "A";
    const next: "A" | "B" = current === "A" ? "B" : "A";
    await this.data.set(this.bufKey(slot, next), text);
    // 回读校验后切指针
    const verify = await this.data.get(this.bufKey(slot, next));
    if (verify !== text) throw new Error("存档写入校验失败");
    await this.ptr.set(slot, next);
  }

  /** 读档：活动区 → 备用区回退；双毁抛错 */
  async read(slot: SlotId): Promise<SavePackage> {
    const current = ((await this.ptr.get(slot)) as "A" | "B" | undefined) ?? "A";
    const backup: "A" | "B" = current === "A" ? "B" : "A";
    for (const buf of [current, backup] as const) {
      const text = await this.data.get(this.bufKey(slot, buf));
      if (text === undefined) continue;
      try {
        return parseAndMigrate(text);
      } catch {
        // 单区损坏，尝试备用区
      }
    }
    throw new Error("存档损坏，且无可用备份");
  }

  async peekMeta(slot: SlotId): Promise<SavePackage["meta"] | null> {
    try {
      return (await this.read(slot)).meta;
    } catch {
      return null;
    }
  }

  async wipe(slot: SlotId): Promise<void> {
    await this.data.delete(this.bufKey(slot, "A"));
    await this.data.delete(this.bufKey(slot, "B"));
    await this.ptr.delete(slot);
  }
}

/** 导出 JSON 文本（下载用） */
export function exportText(state: GameState): string {
  return JSON.stringify(toPackage(state), null, 1);
}

/** 导入：走与读档完全相同的校验 + 迁移链（票据 007） */
export function importText(text: string): SavePackage {
  return parseAndMigrate(text);
}

/* ---------------- 浏览器实现 ---------------- */

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    async get(k) {
      return m.get(k);
    },
    async set(k, v) {
      m.set(k, v);
    },
    async delete(k) {
      m.delete(k);
    },
  };
}

export function idbKV(dbName = "text-wuxia-save", store = "buffers"): KV {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
      });
    }
    return dbp;
  };
  const tx = async<T>(mode: IDBTransactionMode, fn: (storeObj: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB 操作失败"));
    });
  };
  return {
    get: (k) => tx<string | undefined>("readonly", (o) => o.get(k)),
    set: (k, v) => tx("readwrite", (o) => o.put(v, k)),
    delete: (k) => tx("readwrite", (o) => o.delete(k)),
  };
}

export function localStorageKV(): KV {
  return {
    async get(k) {
      return localStorage.getItem(k) ?? undefined;
    },
    async set(k, v) {
      localStorage.setItem(k, v);
    },
    async delete(k) {
      localStorage.removeItem(k);
    },
  };
}

/** 浏览器端存档单例：主体 IndexedDB，指针 localStorage（票据 007 介质划分） */
export function browserStore(): SaveStore {
  return new SaveStore(idbKV(), localStorageKV());
}
