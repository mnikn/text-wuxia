import { describe, expect, it } from "vitest";
import { validateRegistry, REGISTRY } from "../src/content/registry";
import { createNewGame } from "../src/game/newGame";
import { commit, listView } from "../src/game/transaction";
import { BALANCE } from "../src/engine/balance";
import { cloneState } from "../src/engine/state";

describe("内容注册表（构建期校验门）", () => {
  it("全部通过：id 唯一 / next 可解析 / 无孤岛 / 检定有档带", () => {
    expect(validateRegistry()).toEqual([]);
  });

  it("内容预算：环境与生活单元 ≥12、护送链 ≥8、入口单元条件齐备", () => {
    const life = Object.values(REGISTRY.units).filter((u) => u.id.startsWith("life.") || u.id.startsWith("wharf.night"));
    expect(life.length).toBeGreaterThanOrEqual(12);
    const escort = Object.values(REGISTRY.units).filter((u) => u.id.startsWith("escort."));
    expect(escort.length).toBeGreaterThanOrEqual(8);
    const entries = Object.values(REGISTRY.units).filter((u) => u.entry);
    expect(entries.length).toBeGreaterThanOrEqual(15);
  });
});

describe("事务管线冒烟", () => {
  it("新开局可行动：看状态、移动、打工", () => {
    let s = createNewGame({ name: "测试客", originId: "porter", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 } });
    const views = listView(s);
    expect(views.length).toBeGreaterThan(3);
    const r = commit(s, { kind: "move", to: "wharf" });
    expect(r.ok, r.reason).toBe(true);
    s = r.state;
    expect(s.location).toBe("wharf");
    const work = commit(s, { kind: "action", id: "work.dock" });
    expect(work.ok, work.reason).toBe(true);
    expect(work.state.player.money).toBeGreaterThan(s.player.money);
  });

  it("非法行动零消耗：状态与 RNG 逐字节不变", () => {
    const s = createNewGame({ name: "测试客", originId: "refugee", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 } });
    const before = cloneState(s);
    const r = commit(s, { kind: "action", id: "buy.sword" }); // 20 文买不起 200 文剑
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(before));
    const m = commit(s, { kind: "move", to: "way-station" }); // 不相邻
    expect(m.ok).toBe(false);
    expect(JSON.stringify(m.state)).toBe(JSON.stringify(before));
  });

  it("确定性：同快照同行动序列两次执行逐字节一致（票据 003）", () => {
    const run = (): string => {
      let s = createNewGame({
        name: "复现客",
        originId: "student",
        attrs: { arm: 6, agi: 5, con: 5, ins: 4, com: 6, luck: 4 },
        seed: 12345,
      });
      for (let i = 0; i < 40; i++) {
        const views = listView(s).filter((v) => !v.disabled && !v.hidden);
        if (views.length === 0) break;
        const pick = views[i % views.length];
        const intent =
          pick.kind === "move"
            ? ({ kind: "move", to: pick.id } as const)
            : ({ kind: pick.kind, id: pick.id } as const);
        const r = commit(s, intent, true);
        if (!r.ok) {
          const r2 = commit(s, { kind: "action", id: "eat.ration" }, true);
          if (!r2.ok) break;
          s = r2.state;
          continue;
        }
        s = r.state;
      }
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it("时钟恒推进、行动集非空（软锁检测的基本形）", () => {
    let s = createNewGame({ name: "软锁探针", originId: "refugee", attrs: { arm: 4, agi: 4, con: 6, ins: 4, com: 4, luck: 8 } });
    const start = s.clock.minutes;
    for (let i = 0; i < 30; i++) {
      const views = listView(s).filter((v) => !v.disabled && !v.hidden && v.kind !== "move");
      expect(views.length, `第${i}步无可选行动（软锁）`).toBeGreaterThan(0);
      const r = commit(s, { kind: "action", id: views[i % views.length].id }, true);
      if (!r.ok) break;
      s = r.state;
    }
    expect(s.clock.minutes).toBeGreaterThan(start);
  });

  it("债务死线：第 5 日午时未还则利滚利并触发催账标记", () => {
    let s = createNewGame({ name: "欠债客", originId: "refugee", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 } });
    // 直接推进到死线后
    s.clock.minutes = BALANCE.debtDueMinute + 10;
    expect(s.player.debt).toBe(BALANCE.debtAmount);
    const r = commit(s, { kind: "action", id: "eat.ration" }, true);
    expect(r.ok, r.reason).toBe(true);
    s = r.state;
    expect(s.player.debt).toBeGreaterThan(BALANCE.debtAmount);
    expect(s.stories.flags["life.debtDefaulted"]).toBe(true);
  });
});
