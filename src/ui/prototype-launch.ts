import { createSliceState, type SliceState } from "../twee/runtime";

export type PrototypePresetId = "fresh" | "opening-complete";

export const PROTOTYPE_PRESETS: ReadonlyArray<{ id: PrototypePresetId; label: string }> = [
  { id: "fresh", label: "全新开局" },
  { id: "opening-complete", label: "开场完成" },
];

export function isPrototypePresetId(value: string): value is PrototypePresetId {
  return PROTOTYPE_PRESETS.some((preset) => preset.id === value);
}

/** 开发态场景预设：集中准备直达后置场景所需的完整状态。 */
export function createPrototypeState(presetId: PrototypePresetId): SliceState {
  const state = createSliceState();
  if (presetId === "fresh") return state;

  state.clock = { day: 1, minute: 17 * 60 };
  state.money = 500;
  state.visited = {
    看过剑: true,
    取剑: true,
    当剑: true,
    "开场.停留": true,
    "开场.盘算": true,
    "开场.辞行": true,
  };
  return state;
}

