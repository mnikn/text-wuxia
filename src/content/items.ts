/**
 * 物品登记表（引擎侧权威）：书写面用名、显示名与单件重量。
 *
 * 数量在运行时的语义一律是「件数」，重量是单件属性；重量单位是「斤」。
 * 内容侧只能使用这里登记的名字（编译器按本表校验），新增物品 = 改本表。
 * 银钱不是物品，不在此表（见 CONTEXT.md「银钱」）。
 */

export interface ItemDef {
  /** 书写面用名：内容侧 `item("剑")` 里的那个名字 */
  id: string;
  /** 显示名：行囊与行止记录里的称谓 */
  名: string;
  /** 单件重量（斤） */
  重量: number;
}

export const ITEMS: Record<string, ItemDef> = {
  剑: { id: "剑", 名: "剑", 重量: 3 },
  米袋: { id: "米袋", 名: "米袋", 重量: 15 },
  药包: { id: "药包", 名: "药包", 重量: 1 },
  当票: { id: "当票", 名: "当票", 重量: 0 },
};

/** 名字是否在表里（用 hasOwnProperty 挡掉 constructor 这类原型键）。 */
export function hasItem(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ITEMS, id);
}

export function itemDef(id: string): ItemDef | undefined {
  return hasItem(id) ? ITEMS[id] : undefined;
}

/** 显示名；不在表里时原样返回（校验门已经拦过，这里只为兜底）。 */
export function itemName(id: string): string {
  return itemDef(id)?.名 ?? id;
}

/** 单件重量（斤）；不在表里按 0 算。负重求和与界面都从这里取，别再各写一份。 */
export function itemWeight(id: string): number {
  return itemDef(id)?.重量 ?? 0;
}

/** 物品名的登记清单，用于诊断信息。 */
export function itemList(): string[] {
  return Object.keys(ITEMS);
}
