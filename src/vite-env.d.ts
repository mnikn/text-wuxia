/// <reference types="vite/client" />

/** 构建期由 src/vite/twee-plugin.ts 编译 .twee 得到的虚拟模块 */
declare module "virtual:twee" {
  import type { Diagnostic, IrPassage } from "./twee/types";

  export const PASSAGES: IrPassage[];
  export const INDEX: Record<string, number>;
  export const DIAGNOSTICS: Diagnostic[];
  const mod: { PASSAGES: IrPassage[]; INDEX: Record<string, number>; DIAGNOSTICS: Diagnostic[] };
  export default mod;
}
