/**
 * 目录编译：按 DoL 那样「区域/地点/main.twee」嵌套放，多个文件合并成一个程序。
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join as pathJoin } from "node:path";
import { compileTweeDir } from "../src/vite/twee-plugin";

const lines = (...xs: string[]): string => xs.join("\n");

/** 在临时目录里铺一套嵌套文件，返回目录路径。 */
function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(pathJoin(tmpdir(), "twee-dir-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = pathJoin(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  }
  return dir;
}

/** 跑编译并把抛出的错误消息取回来（没过校验门时 compileTweeDir 直接抛）。 */
function compileError(dir: string): string {
  try {
    compileTweeDir(dir);
    return "";
  } catch (e) {
    return String((e as Error).message);
  }
}

describe("目录编译", () => {
  it("递归读子目录，多个文件合成一个程序", () => {
    const dir = fixture({
      "城郊/loc-家门外/main.twee": lines(":: 地点.家门外 [scene]", "", "家里。", ""),
      "县城/loc-当铺/main.twee": lines(
        ":: 地点.当铺 [scene]",
        "",
        "柜台。",
        "",
        '<<choice id="go" label="前往城郊家村" exit="true" cost="time 30">>',
        "<<next 地点.家门外>>",
        "<</choice>>",
        "",
      ),
    });
    try {
      const r = compileTweeDir(dir);
      expect(r.errors).toEqual([]);
      expect(r.summary).toContain("2 个单元、1 个选项");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("两个文件里同名单元报错，且报出相对路径", () => {
    const dir = fixture({
      "a/main.twee": lines(":: 同名单元 [scene]", "", "甲。", ""),
      "b/main.twee": lines(":: 同名单元 [scene]", "", "乙。", ""),
    });
    try {
      const msg = compileError(dir);
      expect(msg).toMatch(/单元 id 与另一个文件重复/);
      expect(msg).toMatch(/[ab]\/main\.twee/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("一个 .twee 都没有时报错", () => {
    const dir = mkdtempSync(pathJoin(tmpdir(), "twee-dir-"));
    try {
      expect(compileError(dir)).toMatch(/没有 \.twee 文件/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
