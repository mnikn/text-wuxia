/** UI 与模拟器共用的轻量派生预览（不进存档）。 */
import { BALANCE } from "./balance";

export function derivedHpPreview(con: number): number {
  return BALANCE.baseHp + con * BALANCE.hpPerCon;
}

/** 债务死线所在日（界面文案用） */
export const BAL_DEBT_DUE_DAY = Math.floor(BALANCE.debtDueMinute / 1440) + 1;
