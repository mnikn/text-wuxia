/** 确定性 RNG：权威状态只保存 seed + cursor，相同状态与行动产生相同结果（票据 003/004）。 */

export interface RngState {
  seed: number;
  cursor: number;
}

/** 与战斗原型同一哈希（mulberry 风格），移植自 planning/wayfinder/prototypes/combat-loop.html */
export function roll(rng: RngState): { value: number; rng: RngState } {
  let h = (rng.seed ^ Math.imul(rng.cursor + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  const value = ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  return { value, rng: { seed: rng.seed, cursor: rng.cursor + 1 } };
}

/** [min, max] 闭区间整数 */
export function rollRange(rng: RngState, min: number, max: number): { value: number; rng: RngState } {
  const r = roll(rng);
  return { value: Math.round(min + r.value * (max - min)), rng: r.rng };
}

/** d100：1..100 */
export function rollD100(rng: RngState): { value: number; rng: RngState } {
  const r = roll(rng);
  return { value: Math.floor(r.value * 100) + 1, rng: r.rng };
}

/** 加权随机挑选，返回被选中的下标 */
export function weightedPick<T>(rng: RngState, items: T[], weight: (t: T) => number): { index: number; rng: RngState } {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0 || items.length === 0) return { index: -1, rng };
  const r = roll(rng);
  let acc = r.value * total;
  for (let i = 0; i < items.length; i++) {
    acc -= Math.max(0, weight(items[i]));
    if (acc < 0) return { index: i, rng: r.rng };
  }
  return { index: items.length - 1, rng: r.rng };
}

/** 由字符串生成数值种子（存档内保存数值形式） */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function newSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}
