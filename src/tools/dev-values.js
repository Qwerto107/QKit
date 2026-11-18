import { decodeText } from "./codecs.js";

export function formatJson(text, indent = "  ") {
  JSON.parse(text);
  // 只调整词元之间的空白，避免大整数失真或重复键被合并。
  let depth = 0;
  let previous;
  const newline = () => (indent ? "\n" + indent.repeat(depth) : "");
  return text.replace(
    /"(?:[^"\\]|\\.)*"|[{}\[\],:]|[^\s{}\[\],:"]+|\s+/g,
    (token) => {
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
    },
  );
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
