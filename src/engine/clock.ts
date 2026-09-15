/** 游戏时钟：分钟为最小粒度，每日 12 时辰（票据 003 集中推进）。 */

export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_SHICHEN = 120;
export const SHICHEN_NAMES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

export interface ClockState {
  /** 从第 1 日 00:00 起的绝对分钟数 */
  minutes: number;
}

export function dayOf(clock: ClockState): number {
  return Math.floor(clock.minutes / MINUTES_PER_DAY) + 1;
}

export function minuteOfDay(clock: ClockState): number {
  return clock.minutes % MINUTES_PER_DAY;
}

export function shichenIndex(clock: ClockState): number {
  return Math.floor(minuteOfDay(clock) / MINUTES_PER_SHICHEN) % 12;
}

export function shichenName(clock: ClockState): string {
  return SHICHEN_NAMES[shichenIndex(clock)];
}

/** "第2日·午时" —— 存档 meta 与界面通用格式（票据 007） */
export function formatClock(clock: ClockState): string {
  return `第${dayOf(clock)}日·${shichenName(clock)}时`;
}

export function isNight(clock: ClockState): boolean {
  const m = minuteOfDay(clock);
  return m < 6 * 60 || m >= 20 * 60;
}

export function advance(clock: ClockState, minutes: number): ClockState {
  return { minutes: clock.minutes + Math.max(0, Math.round(minutes)) };
}

/** 真实时段说明（时辰 + 刻） */
export function formatTimeOfDay(clock: ClockState): string {
  const m = minuteOfDay(clock);
  const idx = Math.floor(m / MINUTES_PER_SHICHEN);
  const quarter = Math.floor((m % MINUTES_PER_SHICHEN) / 30);
  const q = quarter === 0 ? "初" : "正";
  return `${SHICHEN_NAMES[idx]}时${q}`;
}
