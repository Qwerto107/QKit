import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCipheriv, createHash, createHmac } from "node:crypto";
import { generatePasswords } from "../src/tools/password.js";
import {
  encodeText,
  decodeText,
  base64ToBytes,
  convertUrl,
} from "../src/tools/codecs.js";
import { hashText, md5Results } from "../src/tools/hashes.js";
import { transformCipher } from "../src/tools/cipher.js";
import { dateToTimestamp, timestampToDate } from "../src/tools/timestamp.js";

test("页面 ID 唯一，避免图标和工具面板互相遮蔽", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("Base64 支持中文、Emoji、空文本和未填充内容，并拒绝无效输入", () => {
  for (const text of [
    "",
    "你好，QKit 🧰",
    "a\u0000b",
    "<script>alert(1)</script>",
  ]) {
    assert.equal(encodeText(text), Buffer.from(text).toString("base64"));
    assert.equal(decodeText(encodeText(text)), text);
  }
  assert.equal(decodeText("YQ"), "a");
  for (const invalid of ["a", "a===", "!!!!", "YR=="])
    assert.throws(() => base64ToBytes(invalid));
  assert.throws(() => decodeText("/w=="));
});

test("URL 两种模式正确处理保留字符，并拒绝损坏的转义", () => {
  const input = "https://example.com/?q=你好 世界&a=1#片段";
  for (const full of [true, false])
    assert.equal(convertUrl(convertUrl(input, false, full), true, full), input);
  assert.equal(convertUrl("%2F", true, true), "%2F");
  assert.equal(convertUrl("%2F", true, false), "/");
  assert.throws(() => convertUrl("%E0%A4", true, false));
});

const passwordConfig = {
  characters: [true, true, true, false, false, true, false, false],
  options: [true, true, true],
  minimums: [6, 4, 4, 1, 0],
  length: 24,
  count: 50,
  custom: "",
};
test("密码满足长度、数量、配额、去重及易混淆字符规则", () => {
  const passwords = generatePasswords(passwordConfig);
  assert.equal(passwords.length, 50);
  for (const [, value] of passwords) {
    assert.equal([...value].length, 24);
    assert.equal(new Set(value).size, 24);
    assert.doesNotMatch(value, /[0O1Il]/);
    assert.ok((value.match(/\d/g) || []).length >= 6);
    assert.ok((value.match(/[a-z]/g) || []).length >= 4);
    assert.ok((value.match(/[A-Z]/g) || []).length >= 4);
    assert.ok((value.match(/[!?+#$%&]/g) || []).length >= 1);
  }
});

test("密码拒绝不可满足的配置，并能处理重叠自定义字符", () => {
  assert.throws(() => generatePasswords({ ...passwordConfig, length: 4 }));
  assert.throws(() =>
    generatePasswords({ ...passwordConfig, characters: Array(8).fill(false) }),
  );
  assert.throws(() =>
    generatePasswords({
      ...passwordConfig,
      length: 64,
      characters: [true, true, true, false, false, false, false, false],
    }),
  );
  const overlap = {
    ...passwordConfig,
    characters: [true, false, false, false, false, false, false, true],
    options: [true, false, true],
    minimums: [5, 0, 0, 0, 5],
    length: 10,
    custom: "0123456789",
  };
  for (const [, value] of generatePasswords(overlap))
    assert.equal(new Set(value).size, 10);
  assert.throws(() =>
    generatePasswords({ ...overlap, minimums: [6, 0, 0, 0, 5] }),
  );
});

test("手动排除字符同时作用于各字符类别和 Unicode 自定义字符", () => {
  for (const [, password] of generatePasswords({
    ...passwordConfig,
    excluded: "abAB!?",
  })) {
    for (const char of "abAB!?") assert.ok(!password.includes(char));
  }
  const custom = {
    ...passwordConfig,
    characters: [false, false, false, false, false, false, false, true],
    options: [true, false, false],
    custom: "Aabc123!🚀✨汉字",
    excluded: "AAaa🚀汉",
    length: 6,
  };
  for (const [, password] of generatePasswords(custom)) {
    assert.equal([...password].length, 6);
    for (const char of [...custom.excluded])
      assert.ok(!password.includes(char));
  }
});

test("排除后的可用字符必须满足数量和去重规则", () => {
  assert.throws(
    () => generatePasswords({ ...passwordConfig, excluded: "0123456789" }),
    /类别不可用/,
  );
  assert.throws(
    () =>
      generatePasswords({
        ...passwordConfig,
        characters: [true, false, false, false, false, false, false, false],
        excluded: "0123456789",
      }),
    /没有可用字符/,
  );
  for (const [, password] of generatePasswords({
    ...passwordConfig,
    excluded: "23",
  })) {
    assert.equal((password.match(/\d/g) || []).length, 6);
    assert.doesNotMatch(password, /[23]/);
  }
});

test("八种哈希及 HMAC 与 Node 独立实现一致", async () => {
  const algorithms = {
    "SHA-1": "sha1",
    "SHA-224": "sha224",
    "SHA-256": "sha256",
    "SHA-384": "sha384",
    "SHA-512": "sha512",
    "SHA3-256": "sha3-256",
    "RIPEMD-160": "ripemd160",
    SM3: "sm3",
  };
  for (const [name, nodeName] of Object.entries(algorithms)) {
    for (const input of ["", "你好，QKit 🧰"]) {
      assert.equal(
        await hashText(input, name),
        createHash(nodeName).update(input).digest("hex"),
      );
      assert.equal(
        await hashText(input, name, "密钥"),
        createHmac(nodeName, "密钥").update(input).digest("hex"),
      );
    }
  }
  assert.equal(
    await hashText("abc", "SHA-256", "", 2),
    createHash("sha256").update("abc").digest("base64"),
  );
  assert.equal(
    await hashText("abc", "SHA-256", "", 1),
    createHash("sha256").update("abc").digest("hex").toUpperCase(),
  );
});

test("MD5 文本、空文件和跨块文件结果正确", async () => {
  for (const value of [
    "",
    "你好，QKit",
    new Blob([]),
    new Blob([new Uint8Array(2 * 1024 * 1024 + 5).fill(37)]),
  ]) {
    const bytes =
      value instanceof Blob ? Buffer.from(await value.arrayBuffer()) : value;
    const expected = createHash("md5").update(bytes).digest("hex");
    const results = await md5Results(value);
    assert.deepEqual(
      results.map((row) => row[1]),
      [
        expected,
        expected.toUpperCase(),
        expected.slice(8, 24),
        expected.slice(8, 24).toUpperCase(),
      ],
    );
  }
});

test("AES CBC、ECB、CTR、GCM 与 Node 加密结果一致，覆盖三种密钥长度", async () => {
  const text = "你好，QKit 🧰";
  for (const bits of [128, 192, 256]) {
    for (const mode of ["CBC", "ECB", "CTR", "GCM"]) {
      const config = {
        algorithm: "AES",
        mode,
        padding: mode === "CTR" || mode === "GCM" ? "NoPadding" : "Pkcs7",
        keyBits: bits,
        key: "k".repeat(bits / 8),
        iv: "i".repeat(mode === "GCM" ? 12 : 16),
        format: "Base64",
      };
      const cipher = createCipheriv(
        `aes-${bits}-${mode.toLowerCase()}`,
        Buffer.from(config.key),
        mode === "ECB" ? null : Buffer.from(config.iv),
      );
      let expected = Buffer.concat([cipher.update(text), cipher.final()]);
      if (mode === "GCM")
        expected = Buffer.concat([expected, cipher.getAuthTag()]);
      const actual = await transformCipher(text, config);
      assert.equal(actual, expected.toString("base64"), `${bits}/${mode}`);
      assert.equal(await transformCipher(actual, config, true), text);
    }
  }
});

test("DES、3DES 及三种填充可往返，Hex 输出可解密", async () => {
  for (const algorithm of ["DES", "3DES"]) {
    for (const mode of ["CBC", "ECB"]) {
      for (const padding of ["Pkcs7", "ZeroPadding", "NoPadding"]) {
        const config = {
          algorithm,
          mode,
          padding,
          keyBits: 192,
          key: "k".repeat(algorithm === "DES" ? 8 : 24),
          iv: "12345678",
          format: "Hex",
        };
        const text = padding === "NoPadding" ? "12345678abcdefgh" : "你好 QKit";
        assert.equal(
          await transformCipher(
            await transformCipher(text, config),
            config,
            true,
          ),
          text,
        );
      }
    }
  }
});

test("加密拒绝错误长度、损坏填充及被篡改的 GCM 标签", async () => {
  const config = {
    algorithm: "AES",
    mode: "CBC",
    padding: "Pkcs7",
    keyBits: 128,
    key: "1234567890123456",
    iv: "1234567890123456",
    format: "Hex",
  };
  await assert.rejects(transformCipher("abc", { ...config, key: "short" }));
  await assert.rejects(transformCipher("abc", { ...config, iv: "short" }));
  await assert.rejects(
    transformCipher("abc", { ...config, padding: "NoPadding" }),
  );
  await assert.rejects(transformCipher("00".repeat(16), config, true));
  const gcm = {
    ...config,
    mode: "GCM",
    iv: "123456789012",
    padding: "NoPadding",
  };
  const encrypted = await transformCipher("abc", gcm);
  const corrupted = `${encrypted.slice(0, -2)}${encrypted.endsWith("00") ? "01" : "00"}`;
  await assert.rejects(transformCipher(corrupted, gcm, true));
});

test("时间戳转换独立于主机时区，覆盖负值、闰日和非法输入", () => {
  assert.equal(timestampToDate("0"), "1970-01-01 08:00:00");
  assert.equal(timestampToDate("-1", false, 0), "1969-12-31 23:59:59");
  for (const offset of [8, 0, -5, 9]) {
    const timestamp = dateToTimestamp("2024-02-29T12:34:56", offset);
    assert.equal(
      timestampToDate(String(timestamp), true, offset),
      "2024-02-29 12:34:56",
    );
  }
  assert.throws(() => dateToTimestamp("2025-02-29T00:00:00"));
  assert.throws(() => timestampToDate("abc"));
  assert.throws(() => timestampToDate("1.5"));
  assert.throws(() => timestampToDate("9999999999999999999999"));
});
