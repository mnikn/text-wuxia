import { createSliceState, type SliceState } from "../twee/runtime";

type PrototypePresetId = "fresh" | "opening-complete" | "opening-complete-broke";
export type PrototypeLaunchId = "beginning" | "stonebridge-arrival";

export const PROTOTYPE_LAUNCHES: ReadonlyArray<{
  id: PrototypeLaunchId;
  label: string;
  passageId: string;
  presetId: PrototypePresetId;
}> = [
  { id: "beginning", label: "一开始", passageId: "地点.家村.家中", presetId: "fresh" },
  { id: "stonebridge-arrival", label: "初到石桥镇", passageId: "故事.石桥镇.初到", presetId: "opening-complete" },
];

/** 直达单元时的状态预设（开发态）：进门先选身上什么状况，才能验到有钱 / 无钱两条支。 */
export const PROTOTYPE_PRESETS: ReadonlyArray<{ id: PrototypePresetId; label: string }> = [
  { id: "opening-complete", label: "开场之后（五百文）" },
  { id: "opening-complete-broke", label: "开场之后（身无分文）" },
  { id: "fresh", label: "开局（家中）" },
];

export function isPrototypeLaunchId(value: string): value is PrototypeLaunchId {
  return PROTOTYPE_LAUNCHES.some((launch) => launch.id === value);
}

export function isPrototypePresetId(value: string): value is PrototypePresetId {
  return PROTOTYPE_PRESETS.some((preset) => preset.id === value);
}

/** 开发态场景预设：集中准备直达后置场景所需的完整状态。 */
export function createPrototypeState(presetId: PrototypePresetId): SliceState {
  const state = createSliceState();
  if (presetId === "fresh") return state;

  state.clock = { day: 1, minute: 17 * 60 };
  state.money = presetId === "opening-complete-broke" ? 0 : 500;
  // 开场链的体力账：扛粮 20 + 起火 10 + 赴镇 40，走到石桥镇就剩这些
  state.stamina.current = state.stamina.max - 70;
  state.items = { 当票: 1 };
  state.visited = {
    看过剑: true,
    取剑: true,
    当剑: true,
    "故事.开场.煮饭熬药": true,
    "故事.开场.谋生打算": true,
    "故事.开场.辞行": true,
  };
  return state;
}

/** 调试入口只暴露完整模板，调用方无需拼装 passage 与状态预设。 */
export function createPrototypeLaunch(id: PrototypeLaunchId): { passageId: string; state: SliceState } {
  const launch = PROTOTYPE_LAUNCHES.find((candidate) => candidate.id === id);
  if (!launch) throw new Error(`没有这个开局模板：${id}`);
  return { passageId: launch.passageId, state: createPrototypeState(launch.presetId) };
}
