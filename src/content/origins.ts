/** 出身定义（票据 002）：决定初始资源、能力倾向与首位联系人，不锁定长期路线。 */
import type { Attributes } from "../engine/state";

export interface OriginDef {
  id: string;
  name: string;
  desc: string;
  money: number;
  martialSkill: number;
  attrBonus: Partial<Attributes>;
  inventory: Record<string, number>;
  relations: Record<string, number>;
  /** 出身专属故事单元 */
  storyId: string;
  hunger: number;
}

export const ORIGINS: OriginDef[] = [
  {
    id: "refugee",
    name: "流民",
    desc: "从北边逃荒来，家当全在背上。根骨熬得住，就是囊中空空。",
    money: 20,
    martialSkill: 5,
    attrBonus: { con: 1, luck: 1 },
    inventory: { ration: 2 },
    relations: { "miao-priest": 1 },
    storyId: "origin.refugee",
    hunger: 40,
  },
  {
    id: "porter",
    name: "商队杂役",
    desc: "随商队走了一趟镖，队伍散在清河县。手脚麻利，认得码头的人。",
    money: 150,
    martialSkill: 10,
    attrBonus: { arm: 1 },
    inventory: { ration: 1, salve: 1 },
    relations: { "ma-foreman": 1, "bai-innkeeper": 0 },
    storyId: "origin.porter",
    hunger: 20,
  },
  {
    id: "student",
    name: "武馆弃徒",
    desc: "在别处武馆学过几年，被逐出师门。底子还在，师父的脸面没了。",
    money: 60,
    martialSkill: 25,
    attrBonus: { arm: 1, agi: 1 },
    inventory: { ration: 1, "gold-salve": 1 },
    relations: { "tie-coach": -1 },
    storyId: "origin.student",
    hunger: 10,
  },
];

export const ORIGIN_BY_ID: Record<string, OriginDef> = Object.fromEntries(ORIGINS.map((o) => [o.id, o]));
