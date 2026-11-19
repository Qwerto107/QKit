import test from "node:test";
import assert from "node:assert/strict";
import {
  convertColor,
  convertInteger,
  createIdentifier,
  decodeJwt,
  describeJsonError,
  formatJson,
  jsonLevelTokens,
} from "../src/tools/dev-values.js";
import { cronDates } from "../src/tools/developers.js";
import { findMatches } from "../src/tools/regex.js";

test("JSON 调整缩进而不改变重复键、大整数或字符串里的符号", () => {
  const input = String.raw` {"n": 90071992547409931234, "n": 1e+002, "label": "a,b: [\"x\"]", "nested": [[], {"x": false}]} `;
  const output = formatJson(input);
  assert.match(output, /\n  "n": 90071992547409931234,\n  "n": 1e\+002,/);
  assert.match(output, /\n  "nested": \[\n    \[\],\n    \{\n      "x": false/);
  assert.deepEqual(JSON.parse(output), JSON.parse(input));
  assert.equal(
    formatJson(output, ""),
    String.raw`{"n":90071992547409931234,"n":1e+002,"label":"a,b: [\"x\"]","nested":[[],{"x":false}]}`,
  );
  assert.throws(() => formatJson('{"n":}'), SyntaxError);
});

test("JSON 高亮把成对括号和键名放在对应层级，并略过字符串内的括号", () => {
  const input = String.raw`{"a": [{"title": "[{}]", "escaped\\\"key": 1}]}`;
  const tokens = [...jsonLevelTokens(input)];
  assert.deepEqual(tokens.map(({ token, level }) => [token, level]), [
    ["{", 0], ['"a"', 0], ["[", 1], ["{", 2], ['"title"', 2],
    [String.raw`"escaped\\\"key"`, 2], ["}", 2], ["]", 1], ["}", 0],
  ]);
  assert.ok(tokens.every(({ token, index }) => input.startsWith(token, index)));
});

test("JSON 错误详情定位长行中未加引号的键名并截取附近内容", () => {
  const source = '{"pad":"' + "x".repeat(35048) + '", bad: 1}';
  assert.throws(() => JSON.parse(source), (error) => {
    const diagnostic = describeJsonError(source, error.message);
    assert.equal(diagnostic.position, 35059);
    assert.equal(diagnostic.line, 1);
    assert.equal(diagnostic.column, 35060);
    assert.equal(diagnostic.marked, "b");
    assert.match(diagnostic.reason, /双引号/);
    assert.equal(diagnostic.before.length, 49);
    assert.equal(diagnostic.after, "ad: 1}");
    return true;
  });
});

test("JSON 错误详情支持行列坐标、尾逗号与文末定位", () => {
  const source = '{\r\n  "a": 1,\r\n}';
  const trailing = describeJsonError(source, "expected double-quoted property name at line 3 column 1 of the JSON data");
  assert.equal(trailing.position, source.length - 1);
  assert.equal(trailing.marked, "}");
  assert.match(trailing.reason, /逗号/);
  const end = describeJsonError('{\n  "key":', "Unexpected end of JSON input");
  assert.equal(end.position, end.end);
  assert.equal(end.line, 2);
  assert.equal(end.column, 9);
  assert.equal(end.marked, "");
  assert.equal(describeJsonError("text", "JSON Parse error: Unexpected identifier").position, null);
});

test("JWT 用 UTC 显示时间声明，过期边界包含 exp 本身", () => {
  const part = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { sub: "你好", iat: 1, nbf: 10, exp: 20 };
  const token = `${part(header)}.${part(payload)}.AAAA`;
  assert.deepEqual(decodeJwt(token, 20), {
    header,
    payload,
    timestamps: [
      ["iat", "1970-01-01T00:00:01.000Z"],
      ["nbf", "1970-01-01T00:00:10.000Z"],
      ["exp", "1970-01-01T00:00:20.000Z · 已过期"],
    ],
  });
  assert.match(decodeJwt(token, 9).timestamps[1][1], /尚未生效/);
  assert.throws(() => decodeJwt("invalid"), /三段式/);
});

test("UUID 写入 v4 版本和变体，ULID 前缀可还原毫秒时间戳", () => {
  assert.match(
    createIdentifier("uuid"),
    /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/,
  );
  const time = 1700000000000;
  const id = createIdentifier("ulid", time);
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(
    [...id.slice(0, 10)].reduce(
      (value, char) => value * 32 + alphabet.indexOf(char),
      0,
    ),
    time,
  );
});

test("进制转换保留超出安全整数的精度，颜色支持 HEX、RGB 和 HSL", () => {
  assert.deepEqual(convertInteger("-ff", 16), [
    "-11111111",
    "-377",
    "-255",
    "-FF",
  ]);
  assert.equal(convertInteger("20000000000001", 16)[2], "9007199254740993");
  assert.throws(() => convertInteger("108", 8));
  assert.deepEqual(convertColor("#0f0"), {
    hex: "#00FF00",
    rgb: "rgb(0, 255, 0)",
    hsl: "hsl(120, 100%, 50%)",
  });
  assert.equal(convertColor("rgb(0 0 255)").hex, "#0000FF");
  assert.equal(convertColor("hsl(-120deg, 100%, 50%)").hex, "#0000FF");
  assert.throws(() => convertColor("rgb(256, 0, 0)"));
});

test("正则处理 Unicode 零长度匹配、命名组和非全局匹配", () => {
  const zero = findMatches({ pattern: "(?=.)", flags: "gu", text: "😀a" });
  assert.deepEqual(
    zero.hits.map(({ start, end }) => [start, end]),
    [
      [0, 0],
      [2, 2],
    ],
  );
  const capture = findMatches({
    pattern: "(?<letter>[a-z])(\\d)?",
    flags: "",
    text: "a b2",
  });
  assert.deepEqual(capture.hits[0].groups, ["a", undefined]);
  assert.deepEqual(capture.hits[0].named, [["letter", "a"]]);
  assert.equal(capture.hits.length, 1);
});

test("Cron 标准与含秒表达式按指定时区计算未来时间", async () => {
  const now = new Date("2026-11-18T00:00:00Z");
  assert.match((await cronDates("*/15 * * * *", "UTC", now))[0], /00:15:00$/);
  assert.match(
    (await cronDates("*/10 * * * * *", "Asia/Shanghai", now))[0],
    /08:00:10$/,
  );
  await assert.rejects(cronDates("60 * * * *", "UTC", now));
  await assert.rejects(cronDates("0 12 * * *", "Invalid/Zone", now));
});
