const MATCH_LIMIT = 200;
export const REGEX_FLAGS = {
  javascript: "dgimsuvy",
  pcre2: "gimsxuUAD",
  re2: "gims",
};

export function validateRegexInput({ pattern, text }) {
  if (!pattern) throw new Error("请输入正则表达式");
  if (pattern.length > 5000 || text.length > 100000)
    throw new Error("表达式或测试文本过长");
}

export function collectMatches(matches, global) {
  const hits = [];
  for (const match of matches) {
    if (hits.length === MATCH_LIMIT) return { hits, truncated: true };
    hits.push(match);
    if (!global) break;
  }
  return { hits, truncated: false };
}

export function validateFlags(flags, supported) {
  const seen = new Set();
  for (const flag of flags) {
    if (!supported.includes(flag)) throw new Error(`当前语法不支持标志 ${flag}`);
    if (seen.has(flag)) throw new Error(`标志 ${flag} 重复`);
    seen.add(flag);
  }
}

function* javascriptMatches(pattern, flags, text) {
  const regex = new RegExp(pattern, flags);
  // matchAll 按 Unicode 规则越过零长度匹配，省去手动移动游标。
  const matches = regex.global ? text.matchAll(regex) : [regex.exec(text)];
  for (const match of matches) {
    if (!match) break;
    yield {
      start: match.index,
      end: match.index + match[0].length,
      groups: match.slice(1),
      named: Object.entries(match.groups ?? {}),
    };
  }
}

export function findMatches({ pattern, flags, text }) {
  validateRegexInput({ pattern, text });
  return collectMatches(javascriptMatches(pattern, flags, text), flags.includes("g"));
}
