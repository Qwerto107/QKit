import CryptoJS from "crypto-js";
import { $, $$, act, activeIndex, notify } from "../dom.js";
import { base64ToBytes, bytesToBase64 } from "./codecs.js";

const utf8 = new TextEncoder();
function parseKey(value) {
  if (!value.startsWith("hex:")) return utf8.encode(value);
  const hex = value.slice(4);
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex))
    throw new Error("hex: 后须填写完整的十六进制字节");
  return Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
}

function toBytes(wordArray) {
  return Uint8Array.from(
    { length: wordArray.sigBytes },
    (_, i) => (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255,
  );
}

export async function transformCipher(text, config, decrypt = false) {
  const { algorithm, mode, padding, keyBits, format } = config;
  if (!["AES", "DES", "3DES"].includes(algorithm))
    throw new Error("不支持的加密算法");
  if (!["CBC", "ECB", "CTR", "GCM"].includes(mode))
    throw new Error("不支持的加密模式");
  const key = parseKey(config.key);
  const expected = algorithm === "DES" ? 8 : keyBits / 8;
  if (
    (algorithm === "AES" && ![16, 24, 32].includes(expected)) ||
    (algorithm === "3DES" && ![16, 24].includes(expected))
  ) {
    throw new Error("密钥长度设置无效");
  }
  if (key.length !== expected)
    throw new Error(
      `当前密钥须为 ${expected} 字节，实际为 ${key.length} 字节；可填写 UTF-8 文本或 hex:十六进制`,
    );
  if (algorithm !== "AES" && ["CTR", "GCM"].includes(mode))
    throw new Error("DES / 3DES 仅支持 CBC、ECB 模式");
  const blockSize = algorithm === "AES" ? 16 : 8;
  const iv = mode === "ECB" ? new Uint8Array() : parseKey(config.iv);
  const ivSize = mode === "GCM" ? 12 : blockSize;
  if (mode !== "ECB" && iv.length !== ivSize)
    throw new Error(
      `${mode} 模式的 IV 须为 ${ivSize} 字节，实际为 ${iv.length} 字节`,
    );
  let data;
  if (!decrypt) data = utf8.encode(text);
  else if (format === "Hex") {
    if (!/^(?:[0-9a-f]{2})+$/i.test(text.trim()))
      throw new Error("密文须为完整的十六进制字节");
    data = parseKey(`hex:${text.trim()}`);
  } else data = base64ToBytes(text);

  if (mode === "GCM") {
    if (!crypto.subtle)
      throw new Error("GCM 需要在 HTTPS 或 localhost 环境下运行");
    const imported = await crypto.subtle.importKey(
      "raw",
      key,
      "AES-GCM",
      false,
      [decrypt ? "decrypt" : "encrypt"],
    );
    try {
      // GCM 输出为密文紧接 16 字节认证标签；解密时验证标签后才返回明文。
      const result = new Uint8Array(
        await crypto.subtle[decrypt ? "decrypt" : "encrypt"](
          { name: "AES-GCM", iv, tagLength: 128 },
          imported,
          data,
        ),
      );
      if (decrypt)
        return new TextDecoder("utf-8", { fatal: true }).decode(result);
      return format === "Hex"
        ? [...result]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("")
        : bytesToBase64(result);
    } catch {
      throw new Error(
        decrypt
          ? "解密失败：密钥、IV 或认证标签不匹配"
          : "加密失败，请检查输入参数",
      );
    }
  }

  if (!["Pkcs7", "ZeroPadding", "NoPadding"].includes(padding))
    throw new Error("不支持的填充方式");
  if (
    (decrypt || padding === "NoPadding") &&
    mode !== "CTR" &&
    data.length % blockSize
  ) {
    throw new Error(
      `当前内容须为 ${blockSize} 字节的整数倍，请检查密文或选择填充方式`,
    );
  }
  const cipher =
    algorithm === "AES"
      ? CryptoJS.AES
      : algorithm === "DES"
        ? CryptoJS.DES
        : CryptoJS.TripleDES;
  const options = {
    mode: CryptoJS.mode[mode],
    iv: CryptoJS.lib.WordArray.create(iv),
    // 解密先保留填充，再进行严格检查，避免库静默接受损坏的填充。
    padding: decrypt ? CryptoJS.pad.NoPadding : CryptoJS.pad[padding],
  };
  const wordKey = CryptoJS.lib.WordArray.create(key);
  if (!decrypt) {
    const encrypted = cipher.encrypt(
      CryptoJS.lib.WordArray.create(data),
      wordKey,
      options,
    ).ciphertext;
    return encrypted.toString(
      format === "Hex" ? CryptoJS.enc.Hex : CryptoJS.enc.Base64,
    );
  }
  let plain = toBytes(
    cipher.decrypt(
      CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.lib.WordArray.create(data),
      }),
      wordKey,
      options,
    ),
  );
  if (padding === "Pkcs7") {
    const size = plain.at(-1);
    if (
      !size ||
      size > blockSize ||
      size > plain.length ||
      !plain.slice(-size).every((value) => value === size)
    ) {
      throw new Error("解密失败：填充无效，请检查密钥、IV、模式及密文");
    }
    plain = plain.slice(0, -size);
  } else if (padding === "ZeroPadding") {
    let end = plain.length;
    while (end && plain[end - 1] === 0) end--;
    plain = plain.slice(0, end);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    throw new Error("解密结果不是有效的 UTF-8 文本，请检查密钥和加密参数");
  }
}

export function initCipher() {
  const panel = $("#aes");
  const [algorithms, direction] = $$(".seg", panel);
  const [mode, padding, keyBits, format] = $$("select", panel);
  const [key, iv] = $$(".fl input", panel);
  const fields = $$("textarea", panel);
  const buttons = $$(".bar button", panel);
  let previousAlgorithm;
  const sync = () => {
    const algorithm = ["AES", "DES", "3DES"][activeIndex(algorithms)];
    const aes = algorithm === "AES";
    if (algorithm !== previousAlgorithm) {
      const sizes = aes
        ? [128, 192, 256]
        : algorithm === "DES"
          ? [64]
          : [128, 192];
      keyBits.replaceChildren(
        ...sizes.map((size) => new Option(`${size} 位`, size)),
      );
      previousAlgorithm = algorithm;
    }
    keyBits.disabled = algorithm === "DES";
    [...mode.options].forEach((option) => {
      option.disabled = !aes && ["CTR", "GCM"].includes(option.value);
    });
    if (!aes && ["CTR", "GCM"].includes(mode.value)) mode.value = "CBC";
    const gcm = mode.value === "GCM";
    if (gcm) padding.value = "NoPadding";
    padding.disabled = gcm;
    iv.disabled = mode.value === "ECB";
    key.placeholder = `${Number(keyBits.value) / 8} 字节文本，或 hex:十六进制`;
    iv.placeholder = iv.disabled
      ? "ECB 模式无需填写"
      : `${gcm ? 12 : aes ? 16 : 8} 字节文本，或 hex:十六进制`;
    $(".ph p", panel).textContent = gcm
      ? "AES-GCM 认证加密，输出包含 16 字节认证标签"
      : "对称加密，可配置模式、填充与输出格式";
  };
  algorithms.addEventListener("click", sync);
  mode.addEventListener("change", sync);
  keyBits.addEventListener("change", sync);
  sync();
  const execute = (decrypt, button) =>
    act(button, async () => {
      const selected = $$("button", direction);
      selected.forEach((item, index) => {
        const active = index === Number(decrypt);
        item.classList.toggle("on", active);
        item.setAttribute("aria-pressed", active);
      });
      fields[1].value = await transformCipher(
        fields[0].value,
        {
          algorithm: ["AES", "DES", "3DES"][activeIndex(algorithms)],
          mode: mode.value,
          padding: padding.value,
          keyBits: Number(keyBits.value),
          format: format.value,
          key: key.value,
          iv: iv.value,
        },
        decrypt,
      );
      notify(decrypt ? "解密完成" : "加密完成");
    });
  buttons[0].onclick = () => execute(false, buttons[0]);
  buttons[1].onclick = () => execute(true, buttons[1]);
  buttons[2].onclick = () =>
    fields.forEach((field) => {
      field.value = "";
    });
}
