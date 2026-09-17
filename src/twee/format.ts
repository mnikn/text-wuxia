/**
 * .twee 的缩进规整：按块嵌套（`<<choice>>` / `<<if>>` / `<<band>>`）缩进两格。
 *
 * 只管缩进与行尾空白，不动内容：正文行首的空白在解析时会被丢掉（见 parse.ts 的 parseBody），
 * 所以缩进纯粹是给人看的。测试会拿这份格式器当检查器用（format(source) === source）。
 */

const INDENT = "  ";
const OPEN_RE = /^<<(choice|if|band)\b/;
const CLOSE_RE = /^<<\/(choice|if|band)>>/;

export function formatTwee(source: string): string {
  const out: string[] = [];
  let depth = 0;
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") {
      out.push("");
      continue;
    }
    const head = line.trimStart();
    // 单元头部与元数据行顶格，不受所处块影响（它们本来就只在顶层出现）
    if (head.startsWith("::") || head.startsWith("{")) {
      out.push(head);
      continue;
    }
    if (CLOSE_RE.test(head)) {
      depth = Math.max(0, depth - 1);
      out.push(INDENT.repeat(depth) + head);
      continue;
    }
    // <<else>> 是块内的分叉标记，要和它所属的 <<if>> 对齐
    if (head.startsWith("<<else")) {
      out.push(INDENT.repeat(Math.max(0, depth - 1)) + head);
      continue;
    }
    out.push(INDENT.repeat(depth) + head);
    if (OPEN_RE.test(head)) depth++;
  }
  // 文件末尾留一个换行，中间不留连续空行
  const joined = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return joined.replace(/\n*$/, "\n");
}
