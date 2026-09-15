/** 存档层测试（票据 007）：双缓冲原子写、损坏回退、迁移链、导出导入同校验 */
import { describe, expect, it } from "vitest";
import { SaveStore, memoryKV, exportText, importText } from "../src/save/storage";
import { parseAndMigrate, SAVE_VERSION, SaveCorruptError, toPackage, MIGRATIONS } from "../src/save/contract";
import { createNewGame } from "../src/game/newGame";
import { commit } from "../src/game/transaction";

function store() {
  return new SaveStore(memoryKV(), memoryKV());
}

function stateWithActions(actions: number) {
  let s = createNewGame({ name: "存档客", originId: "porter", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 } });
  for (let i = 0; i < actions; i++) {
    const views = ["eat.meal"];
    void views;
    const r = commit(s, { kind: "move", to: i % 2 === 0 ? "inn" : "west-street" }, true);
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}

describe("存档契约与迁移", () => {
  it("toPackage meta 齐全；parse 往返一致", () => {
    const s = createNewGame({ name: "存档客", originId: "porter", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 } });
    const pkg = toPackage(s);
    expect(pkg.meta.version).toBe(SAVE_VERSION);
    expect(pkg.meta.location).toBeTruthy();
    expect(pkg.meta.gameTime).toMatch(/第\d+日/);
    const back = parseAndMigrate(JSON.stringify(pkg));
    expect(back.state.player.name).toBe("存档客");
    expect(back.state.meta.actionNumber).toBe(s.meta.actionNumber);
  });

  it("旧版本存档顺迁移链升级；缺步骤判损坏", () => {
    const s = createNewGame({ name: "老档", originId: "refugee", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 } });
    const pkg = toPackage(s);
    const asV0 = { version: 0, state: { ...pkg.state, meta: { ...pkg.state.meta, version: 0 } } };

    MIGRATIONS[0] = (raw) => raw; // 注册 v0→v1 纯函数
    try {
      const migrated = parseAndMigrate(JSON.stringify(asV0));
      expect(migrated.meta.version).toBe(SAVE_VERSION);
      expect(migrated.state.player.name).toBe("老档");
    } finally {
      delete MIGRATIONS[0];
    }
    delete (asV0 as { state?: unknown }).state;
    expect(() => parseAndMigrate(JSON.stringify({ version: 0, state: {} }))).toThrow(SaveCorruptError);
  });

  it("非法 JSON / 缺版本 / 未来版本 → 判损坏", () => {
    expect(() => parseAndMigrate("{oops")).toThrow(SaveCorruptError);
    expect(() => parseAndMigrate(JSON.stringify({ state: {} }))).toThrow(SaveCorruptError);
    expect(() => parseAndMigrate(JSON.stringify({ version: 99, state: {} }))).toThrow(SaveCorruptError);
  });

  it("导出→导入走同一校验链（票据 007）", () => {
    const s = createNewGame({ name: "导出客", originId: "student", attrs: { arm: 5, agi: 5, con: 5, ins: 5, com: 5, luck: 5 } });
    const pkg = importText(exportText(s));
    expect(pkg.state.player.name).toBe("导出客");
  });
});

describe("双缓冲原子写（票据 007）", () => {
  it("写入→读取往返；指针交替", async () => {
    const st = store();
    const s1 = stateWithActions(2);
    await st.write(s1, "m1");
    const ptr1 = await (st as unknown as { ptr: { get(k: string): Promise<string | undefined> } }).ptr.get("m1");
    await st.write(s1, "m1");
    const ptr2 = await (st as unknown as { ptr: { get(k: string): Promise<string | undefined> } }).ptr.get("m1");
    expect(ptr1).not.toBe(ptr2); // A/B 交替
    const pkg = await st.read("m1");
    expect(pkg.state.meta.actionNumber).toBe(s1.meta.actionNumber);
  });

  it("活动区损坏自动回退备用区；双毁才判损坏", async () => {
    const data = memoryKV();
    const ptr = memoryKV();
    const st = new SaveStore(data, ptr);
    const s = stateWithActions(3);
    await st.write(s, "auto");
    await st.write(s, "auto");

    // 破坏活动区
    const active = (await ptr.get("auto")) ?? "A";
    await data.set(`save:auto:${active}`, "{corrupted");

    const pkg = await st.read("auto");
    expect(pkg.state.meta.actionNumber).toBe(s.meta.actionNumber);

    // 双份皆毁
    await data.set("save:auto:A", "x{");
    await data.set("save:auto:B", "y{");
    await expect(st.read("auto")).rejects.toThrow("存档损坏");
  });

  it("peekMeta 空槽返回 null；wipe 清槽", async () => {
    const st = store();
    expect(await st.peekMeta("m2")).toBeNull();
    const s = stateWithActions(1);
    await st.write(s, "m2");
    expect((await st.peekMeta("m2"))!.gameTime).toBeTruthy();
    await st.wipe("m2");
    expect(await st.peekMeta("m2")).toBeNull();
  });
});
