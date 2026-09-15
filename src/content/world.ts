/** 内容注册表：地点节点 / 具名人物 / 物品 / 泛型模板。稳定 ID，只增不删（票据 003/007/009）。 */

const BAL_RATION = 8;
const BAL_SALVE = 30;
const BAL_GOLD = 60;
const BAL_SWORD = 200;
const BAL_CLUB = 20;
const BAL_COAT = 80;

export interface LocationDef {
  id: string;
  name: string;
  desc: string;
  /** 出城节点（雨天无城市屋檐） */
  outdoors?: boolean;
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  location: string;
  /** 静态日程位置偏移：夜晚（20:00-06:00）的替代地点 */
  nightLocation?: string;
  intro: string;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  price: number | null; // null = 非卖品
  shop?: "market" | "pharmacy";
  /** 可在战斗中使用的金疮药类 */
  combatHeal?: number;
  tag?: "weapon" | "task" | "proof" | "clue";
}

export const LOCATIONS: LocationDef[] = [
  { id: "west-street", name: "西街", desc: "清河县最热闹的一条街，市声从早到晚不断。" },
  { id: "inn", name: "城南客栈", desc: "掌柜白娘子经营的老店，后院有口甜水井。" },
  { id: "market", name: "西街市集", desc: "菜担、铁器、布匹挤在一起，也挤着各路消息。" },
  { id: "pharmacy", name: "回春药铺", desc: "苏掌柜坐堂，柜上常年一副苦药味。" },
  { id: "school", name: "武馆", desc: "铁教头的场子，器械架上刀枪林立。" },
  { id: "wharf", name: "码头脚行", desc: "货船靠岸的地方，马把头嗓门比号子还响。" },
  { id: "temple", name: "城隍庙", desc: "香火寥落，庙祝守着；侧殿收留没处去的人过夜。" },
  { id: "sect-post", name: "照川门驻点", desc: "照川门在县城的落脚处，顾执事在此坐镇。" },
  { id: "city-gate", name: "城门", desc: "出城的官道口，兵丁查验出入。" },
  { id: "mountain-pass", name: "山道口", desc: "入山的岔路，走山道近，也险。" },
  { id: "way-station", name: "青云驿", desc: "官道上的驿站，近日遭了袭击，正在善后。" },
];

export const NPCS: NpcDef[] = [
  { id: "gu-executive", name: "顾执事", title: "照川门执事", location: "sect-post", intro: "照川门驻清河的执事，处理入门与差事。" },
  { id: "shen-disciple", name: "沈青梧", title: "照川门带队弟子", location: "sect-post", nightLocation: "inn", intro: "照川门弟子，负责带队护送。" },
  { id: "bai-innkeeper", name: "白掌柜", title: "城南客栈掌柜", location: "inn", intro: "客栈掌柜，消息灵通，账算得清。" },
  { id: "su-pharmacist", name: "苏掌柜", title: "回春药铺坐堂", location: "pharmacy", intro: "药铺掌柜，识药，也识人。" },
  { id: "tie-coach", name: "铁教头", title: "武馆教头", location: "school", intro: "武馆教头，拳脚硬，脾气也硬。" },
  { id: "ma-foreman", name: "马把头", title: "码头脚行把头", location: "wharf", intro: "脚行把头，管活儿也管人。" },
  { id: "miao-priest", name: "庙祝", title: "城隍庙庙祝", location: "temple", intro: "守庙的老人，见惯了过夜的人和过路的鬼。" },
  { id: "chen-courier", name: "陈驿卒", title: "青云驿驿卒", location: "way-station", intro: "遭袭受伤的驿卒。" },
];

export const ITEMS: ItemDef[] = [
  { id: "ration", name: "干粮", desc: "抵一餐。", price: BAL_RATION, shop: "market" },
  { id: "salve", name: "跌打药", desc: "外敷，助中伤恢复。", price: BAL_SALVE, shop: "pharmacy" },
  { id: "gold-salve", name: "金疮药", desc: "战斗中敷用，气血+25。", price: BAL_GOLD, shop: "pharmacy", combatHeal: 25 },
  { id: "sword", name: "青钢剑", desc: "制式长剑，战斗伤害更佳。", price: BAL_SWORD, shop: "market", tag: "weapon" },
  { id: "club", name: "木棍", desc: "趁手的粗木棍，聊胜于无。", price: BAL_CLUB, shop: "market", tag: "weapon" },
  { id: "coat", name: "夹棉短袄", desc: "御寒过夜，破庙歇息恢复更佳。", price: BAL_COAT, shop: "market" },
  { id: "herb", name: "药草", desc: "山坡采的药材，可卖与药铺。", price: null },
  { id: "herb-parcel", name: "药材担", desc: "照川门托付的护送货物，封签完好。", price: null, tag: "task" },
  { id: "bandit-token", name: "山匪腰牌", desc: "伏击者遗落的腰牌，刻着古怪记号。", price: null, tag: "clue" },
  { id: "seal-slip", name: "货封签", desc: "盖着药行印记的封签。", price: null, tag: "task" },
];

/** 移动图：无向边，分钟成本按单向声明（山道受雨天影响） */
export interface TravelEdge {
  from: string;
  to: string;
  minutes: number;
  /** 雨天倍率 applies */
  weatherSensitive?: boolean;
  /** 仅护送期间可达 */
  escortOnly?: boolean;
}

export const TRAVEL: TravelEdge[] = [
  { from: "west-street", to: "inn", minutes: 10 },
  { from: "west-street", to: "market", minutes: 5 },
  { from: "west-street", to: "pharmacy", minutes: 15 },
  { from: "west-street", to: "school", minutes: 15 },
  { from: "west-street", to: "wharf", minutes: 25 },
  { from: "west-street", to: "temple", minutes: 25 },
  { from: "west-street", to: "sect-post", minutes: 20 },
  { from: "west-street", to: "city-gate", minutes: 40, weatherSensitive: true },
  { from: "city-gate", to: "mountain-pass", minutes: 30, weatherSensitive: true },
  { from: "city-gate", to: "way-station", minutes: 60, weatherSensitive: true },
  { from: "mountain-pass", to: "way-station", minutes: 50, weatherSensitive: true, escortOnly: true },
];

export function travelMinutes(edge: TravelEdge, weather: string): number {
  const rain = weather === "雨" && edge.weatherSensitive;
  const wind = weather === "风" && edge.weatherSensitive;
  return Math.round(edge.minutes * (rain ? 1.5 : wind ? 1.2 : 1));
}

export function edgesFrom(loc: string, escortActive: boolean): TravelEdge[] {
  return TRAVEL.filter((e) => (e.from === loc || e.to === loc) && (!e.escortOnly || escortActive));
}

export const LOCATION_NAME: Record<string, string> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l.name]));
export const NPC_NAME: Record<string, string> = Object.fromEntries(NPCS.map((n) => [n.id, n.name]));
export const ITEM_NAME: Record<string, string> = Object.fromEntries(ITEMS.map((i) => [i.id, i.name]));

export function npcAt(npc: NpcDef, minuteOfDay: number): string {
  const night = minuteOfDay < 6 * 60 || minuteOfDay >= 20 * 60;
  return night && npc.nightLocation ? npc.nightLocation : npc.location;
}

/** BFS 多跳寻路：返回自 from 通往 to 的下一跳地点 id；不可达/已到达返回 null */
export function nextHop(from: string, to: string): string | null {
  if (from === to) return null;
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of TRAVEL) {
      if (e.escortOnly) continue;
      const next = e.from === cur ? e.to : e.to === cur ? e.from : null;
      if (!next || prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        let hop = next;
        while (prev.get(hop) !== from) hop = prev.get(hop)!;
        return hop;
      }
      queue.push(next);
    }
  }
  return null;
}
