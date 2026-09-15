/** 存档契约（票据 007）：meta + GameState 快照；UI/view model 不进契约。 */
import type { GameState } from "../engine/state";
import { validateState } from "../engine/state";
import { formatClock } from "../engine/clock";
import { LOCATION_NAME } from "../content/world";

export const SAVE_VERSION = 1;

export interface SaveMeta {
  version: number;
  actionNumber: number;
  seed: number;
  playthroughId: string;
  gameTime: string;
  location: string;
  savedAt: string;
}

export interface SavePackage {
  meta: SaveMeta;
  state: GameState;
}

export function toPackage(state: GameState): SavePackage {
  return {
    meta: {
      version: SAVE_VERSION,
      actionNumber: state.meta.actionNumber,
      seed: state.meta.seed,
      playthroughId: state.meta.playthroughId,
      gameTime: formatClock(state.clock),
      location: LOCATION_NAME[state.location] ?? state.location,
      savedAt: new Date().toISOString(),
    },
    state,
  };
}

/** 迁移链：migrate(v) → v+1 纯函数序列；读档/导入顺链执行（票据 007） */
export const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 为首发契约；后续版本在此追加纯函数
};

export class SaveCorruptError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SaveCorruptError";
  }
}

/** 读取任意版本存档包：结构校验 → 顺迁移链 → 完整状态校验（任一失败判损坏） */
export function parseAndMigrate(text: string): SavePackage {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveCorruptError("存档不是合法 JSON");
  }
  if (typeof raw !== "object" || raw === null) throw new SaveCorruptError("存档结构缺失");
  const pkg = raw as Record<string, unknown>;
  let version = typeof pkg.version === "number" ? pkg.version : (pkg.meta as { version?: number })?.version;
  if (typeof version !== "number") throw new SaveCorruptError("缺少版本号");
  if (version > SAVE_VERSION) throw new SaveCorruptError(`存档版本（${version}）高于当前版本（${SAVE_VERSION}），请更新游戏`);
  let body = (pkg.state ?? pkg) as Record<string, unknown>;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new SaveCorruptError(`缺少迁移步骤：v${version} → v${version + 1}`);
    body = step(body);
    version += 1;
  }
  const state = body as unknown as GameState;
  if (!state || typeof state !== "object" || !state.player || !state.clock || !state.meta) {
    throw new SaveCorruptError("存档缺少必需数据域");
  }
  const issues = validateState(state);
  if (issues.length > 0) throw new SaveCorruptError(`存档状态校验失败：${issues.join("；")}`);
  const meta = (typeof pkg.meta === "object" && pkg.meta !== null ? pkg.meta : {}) as Partial<SaveMeta>;
  return {
    meta: {
      version: SAVE_VERSION,
      actionNumber: state.meta.actionNumber,
      seed: state.meta.seed,
      playthroughId: state.meta.playthroughId,
      gameTime: formatClock(state.clock),
      location: LOCATION_NAME[state.location] ?? state.location,
      savedAt: meta.savedAt ?? new Date().toISOString(),
    },
    state,
  };
}
