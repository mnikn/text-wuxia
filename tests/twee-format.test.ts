/**
 * 缩进即成文：内容文件必须已经过 formatTwee（CI 用它当检查器，跑测试就能发现手写的乱缩进）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { formatTwee } from "../src/twee/format";

function collect(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (name.endsWith(".twee")) out.push(full);
  }
}

describe("twee 缩进", () => {
  it("内容文件都按嵌套缩进（两格一层）", () => {
    const files: string[] = [];
    collect("src/content/twee", files);
    const bad = files.filter((f) => formatTwee(readFileSync(f, "utf8")) !== readFileSync(f, "utf8")).map((f) => relative(".", f));
    expect(bad).toEqual([]);
  });

  it("缩进不改语义：解析出的正文与不缩进时一致", () => {
    const src = [':: a [scene]', "", "<<if true>>", "  正文一。", "", "  <<choice id=\"c\" label=\"走\">>", "    正文二。", "  <</choice>>", "<</if>>", ""].join("\n");
    expect(formatTwee(src)).toBe(src);
  });
});
