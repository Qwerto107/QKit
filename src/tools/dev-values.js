import { decodeText } from "./codecs.js";

const JSON_TOKENS = /"(?:[^"\\]|\\.)*"|[{}\[\],:]|[^\s{}\[\],:"]+|\s+/g;

export function formatJson(text, indent = "  ") {
  JSON.parse(text);
  // 只调整词元之间的空白，避免大整数失真或重复键被合并。
  let depth = 0;
  let previous;
  const newline = () => (indent ? "\n" + indent.repeat(depth) : "");
  return text.replace(JSON_TOKENS, (token) => {
    if (/^\s/.test(token)) return "";
    const followsOpening = previous === "{" || previous === "[";
    previous = token;
    const line = followsOpening ? newline() : "";
    if (token === "{" || token === "[") {
      depth++;
      if (indent && depth > 256) throw new Error("JSON 嵌套过深，无法格式化");
      return line + token;
    }
    if (token === "}" || token === "]") {
      depth--;
      return (followsOpening ? "" : newline()) + token;
    }
    if (token === ",") return token + newline();
    if (token === ":") return indent ? ": " : ":";
    return line + token;
  });
}

export function* jsonLevelTokens(text) {
  let depth = 0;
  const colon = /\s*:/y;
  for (const { 0: token, index } of text.matchAll(JSON_TOKENS)) {
    if (token === "}" || token === "]") depth = Math.max(0, depth - 1);
    colon.lastIndex = index + token.length;
    if ("{}[]".includes(token) || (token.startsWith('"') && colon.test(text))) {
      const level = token.startsWith('"') ? Math.max(0, depth - 1) : depth;
      yield { token, index, level };
    }
    if (token === "{" || token === "[") depth++;
  }
}

function jsonErrorOffset(text, message) {
  const position = /\bat position (\d+)(?: \(line \d+ column \d+\))?$/i.exec(message);
  if (position) return Math.min(Number(position[1]), text.length);
  const coordinate = /\bat line (\d+) column (\d+)(?: of the JSON data)?$/i.exec(message);
  if (coordinate) {
    let offset = 0;
    const breaks = text.matchAll(/\r\n|[\r\n]/g);
    for (let line = 1; line < Number(coordinate[1]); line++) {
      const newline = breaks.next().value;
      if (!newline) return null;
      offset = newline.index + newline[0].length;
    }
    return Math.min(offset + Number(coordinate[2]) - 1, text.length);
  }
  if (/^Unexpected end of JSON input$/i.test(message)) return text.length;
  return null;
}

export function describeJsonError(text, message) {
  const position = jsonErrorOffset(text, message);
  const character = position === null ? "" : text[position] ?? "";
  let reason = "JSON 语法有误，请展开原始错误信息。";
  if ((character === "}" || character === "]") && text.slice(0, position).trimEnd().endsWith(",")) {
    reason = "最后一项后多了一个逗号，请删除闭合括号前的逗号。";
  } else if (/expected (?:double-quoted )?property name/i.test(message)) {
    reason = '对象的键名必须用双引号包裹，例如 "name"。';
  } else if (/expected .*?:.*? after property name/i.test(message)) {
    reason = "在键名和值之间加上冒号。";
  } else if (/unexpected end of (?:JSON input|data)/i.test(message)) {
    reason = "JSON 提前结束，请检查是否缺少值、引号或闭合括号。";
  } else if (/unterminated string/i.test(message)) {
    reason = "字符串缺少结束的双引号。";
  } else if (/unexpected non-whitespace character after JSON/i.test(message)) {
    reason = "完整的 JSON 值之后还有多余字符。";
  }
  if (position === null) return { reason, position };

  const lines = text.slice(0, position).split(/\r\n|[\r\n]/);
  const codePoint = text.codePointAt(position);
  const marked = codePoint === undefined ? "" : String.fromCodePoint(codePoint);
  const end = position + marked.length;
  const start = Math.max(0, position - 48);
  const stop = Math.min(text.length, end + 48);
  return {
    reason,
    position,
    end,
    line: lines.length,
    column: lines.at(-1).length + 1,
    before: (start ? "…" : "") + text.slice(start, position),
    marked,
    after: text.slice(end, stop) + (stop < text.length ? "…" : ""),
  };
}

export function decodeJwt(value, now = Date.now() / 1000) {
  const parts = value.trim().split(".");
  if (
    parts.length !== 3 ||
    !parts[0] ||
    !parts[1] ||
    parts.some((part) => !/^[\w-]*$/.test(part))
  ) {
    throw new Error("请输入三段式 JWT（Header.Payload.Signature）");
  }
  const [header, payload] = parts.slice(0, 2).map((part) => {
    const data = JSON.parse(
      decodeText(part.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (!data || Array.isArray(data) || typeof data !== "object")
      throw new Error("JWT 的 Header 和 Payload 必须是 JSON 对象");
    return data;
  });
  const timestamps = ["iat", "nbf", "exp"].flatMap((key) => {
    if (!Object.hasOwn(payload, key)) return [];
    const seconds = payload[key];
    const date = new Date(typeof seconds === "number" ? seconds * 1000 : NaN);
    if (!Number.isFinite(date.getTime())) return [[key, "无效的时间声明"]];
    const state =
      key === "exp"
        ? now >= seconds
          ? " · 已过期"
          : " · 未过期"
        : key === "nbf" && now < seconds
          ? " · 尚未生效"
          : "";
    return [[key, date.toISOString() + state]];
  });
  if (!Object.hasOwn(payload, "exp"))
    timestamps.push(["exp", "未提供过期时间"]);
  return { header, payload, timestamps };
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function createIdentifier(type, now = Date.now()) {
  if (type === "ulid") {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    // ULID 的前 48 位是毫秒时间戳，后 80 位使用独立的随机字节。
    let bits = BigInt(now);
    for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
    let output = "";
    for (let i = 0; i < 26; i++, bits >>= 5n)
      output = CROCKFORD[Number(bits & 31n)] + output;
    return output;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function convertInteger(input, base) {
  const match = /^([+-]?)([\da-f]+)$/i.exec(input.trim());
  const digits = {
    2: /^[01]+$/,
    8: /^[0-7]+$/,
    10: /^\d+$/,
    16: /^[\da-f]+$/i,
  }[base];
  if (!match || !digits?.test(match[2]))
    throw new Error("输入包含所选进制不支持的字符");
  if (match[2].length > 1024) throw new Error("最多支持 1024 位整数");
  const prefix = { 2: "0b", 8: "0o", 10: "", 16: "0x" }[base];
  const number = BigInt(prefix + match[2]) * (match[1] === "-" ? -1n : 1n);
  return [2, 8, 10, 16].map((radix) => number.toString(radix).toUpperCase());
}

export function convertColor(value) {
  const formatted = value.trim().toLowerCase();
  const hex = /^#?([a-f\d]{3}|[a-f\d]{6})$/.exec(formatted);
  const fn = /^(rgb|hsl)\((.*)\)$/.exec(formatted);
  let rgb;
  if (hex) {
    const bytes =
      hex[1].length === 3
        ? [...hex[1]].map((char) => char + char)
        : hex[1].match(/../g);
    rgb = bytes.map((byte) => parseInt(byte, 16));
  } else if (fn) {
    const hsl = fn[1] === "hsl";
    const parts = fn[2].trim().split(fn[2].includes(",") ? /\s*,\s*/ : /\s+/);
    const numbers = parts.map((part, i) => {
      const number = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(%|deg)?$/.exec(part);
      if (!number) return NaN;
      const unit = hsl
        ? i
          ? "%"
          : number[2] === "deg"
            ? "deg"
            : undefined
        : undefined;
      return unit === number[2] ? Number(number[1]) : NaN;
    });
    if (
      numbers.length !== 3 ||
      numbers.some(
        (n, i) =>
          !Number.isFinite(n) ||
          ((!hsl || i) && (n < 0 || n > (hsl ? 100 : 255))),
      )
    )
      throw new Error("请输入有效的 RGB 或 HSL 颜色");
    if (!hsl) rgb = numbers.map(Math.round);
    else {
      const [h, s, l] = numbers;
      const hue = ((h % 360) + 360) % 360;
      const light = l / 100;
      const a = (s / 100) * Math.min(light, 1 - light);
      rgb = [0, 8, 4].map((offset) => {
        const k = (offset + hue / 30) % 12;
        return Math.round(
          (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255,
        );
      });
    }
  } else throw new Error("请输入 #HEX、rgb(…) 或 hsl(…) 格式");
  const [r, g, b] = rgb.map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const light = (max + min) / 2;
  const sector = !delta
    ? 0
    : max === r
      ? (g - b) / delta
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  const hue = (sector * 60 + 360) % 360;
  const saturation = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0;
  const round = (number) => Number(number.toFixed(2));
  return {
    hex:
      "#" +
      rgb
        .map((channel) => channel.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase(),
    rgb: `rgb(${rgb.join(", ")})`,
    hsl: `hsl(${round(hue) % 360}, ${round(saturation * 100)}%, ${round(light * 100)}%)`,
  };
}
