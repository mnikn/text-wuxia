/** 检定档带（票据 006/008）：d100 + 检定值 vs 难度；差值 ≥+20 大成功 / ≥0 成功 / >-20 失败 / ≤-20 大失败。个别检定可覆盖阈值。 */
import { BALANCE } from "./balance";
import { rollD100 } from "./rng";
import type { RngState } from "./rng";

export type CheckBand = "大成功" | "成功" | "失败" | "大失败";

export interface CheckResult {
  band: CheckBand;
  roll: number;
  value: number;
  difficulty: number;
  diff: number;
  rng: RngState;
}

export function resolveCheck(
  rng: RngState,
  value: number,
  difficulty: number,
  thresholds?: { great?: number; fail?: number }
): CheckResult {
  const r = rollD100(rng);
  const total = r.value + value;
  const diff = total - difficulty;
  const great = thresholds?.great ?? BALANCE.bandGreat;
  const fail = thresholds?.fail ?? BALANCE.bandFail;
  const band: CheckBand = diff >= great ? "大成功" : diff >= 0 ? "成功" : diff > fail ? "失败" : "大失败";
  return { band, roll: r.value, value: total, difficulty, diff, rng: r.rng };
}

