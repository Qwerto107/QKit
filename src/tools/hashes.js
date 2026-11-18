import {
  createMD5,
  createSHA1,
  createSHA224,
  createSHA256,
  createSHA384,
  createSHA512,
  createSHA3,
  createRIPEMD160,
  createSM3,
  createHMAC,
} from "hash-wasm";
import {
  $,
  $$,
  act,
  activeIndex,
  bindFileDrop,
  icon,
  notify,
  renderResults,
} from "../dom.js";
import { bytesToBase64 } from "./codecs.js";

const ALGORITHMS = {
  "SHA-1": createSHA1,
  "SHA-224": createSHA224,
  "SHA-256": createSHA256,
  "SHA-384": createSHA384,
  "SHA-512": createSHA512,
  "SHA3-256": () => createSHA3(256),
  "RIPEMD-160": createRIPEMD160,
  SM3: createSM3,
};

export async function hashText(text, algorithm, key = "", format = 0) {
  if (!ALGORITHMS[algorithm]) throw new Error("不支持的哈希算法");
  const hasher = key
    ? await createHMAC(ALGORITHMS[algorithm](), key)
    : await ALGORITHMS[algorithm]();
  hasher.init();
  hasher.update(text);
  const bytes = hasher.digest("binary");
  if (format === 2) return bytesToBase64(bytes);
  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return format === 1 ? hex.toUpperCase() : hex;
}

export async function md5Results(source) {
  const hasher = await createMD5();
  hasher.init();
  if (source instanceof Blob) {
    // 分块读取文件，避免大文件一次性占满内存。
    const size = 2 * 1024 * 1024;
    for (let offset = 0; offset < source.size; offset += size) {
      hasher.update(
        new Uint8Array(await source.slice(offset, offset + size).arrayBuffer()),
      );
    }
  } else hasher.update(source);
  const full = hasher.digest();
  const short = full.slice(8, 24);
  return [
    ["32 位小写", full],
    ["32 位大写", full.toUpperCase()],
    ["16 位小写", short],
    ["16 位大写", short.toUpperCase()],
  ];
}

export function initHashes() {
  const panel = $("#hash");
  const buttons = $$(".bar button", panel);
  buttons[0].onclick = () =>
    act(buttons[0], async () => {
      const algorithms = $$(".chip", panel)
        .filter((chip) => $("input", chip).checked)
        .map((chip) => chip.textContent.trim());
      if (!algorithms.length) throw new Error("请至少选择一种算法");
      const text = $("textarea", panel).value;
      const key = $(".fl input", panel).value;
      const format = $("select", panel).selectedIndex;
      const results = await Promise.all(
        algorithms.map(async (algorithm) => [
          key ? `HMAC ${algorithm}` : algorithm,
          await hashText(text, algorithm, key, format),
        ]),
      );
      renderResults($(".res", panel), results);
      notify("哈希计算完成");
    });
  buttons[1].onclick = () => {
    $("textarea", panel).value = "";
    renderResults($(".res", panel), []);
  };

  const md5 = $("#md5");
  const textBox = $(".f", md5);
  const drop = document.createElement("div");
  drop.className = "drop hide";
  drop.innerHTML = `${icon("up")}<b>拖入文件，或点击选择</b><span>本地分块计算，不上传文件</span>`;
  const input = document.createElement("input");
  input.type = "file";
  input.hidden = true;
  input.setAttribute("aria-label", "选择需要计算 MD5 的文件");
  textBox.after(drop, input);
  let file;
  bindFileDrop(drop, input, async (selected) => {
    file = selected;
    $("b", drop).textContent = selected.name;
    $("span", drop).textContent =
      `${(selected.size / 1024).toFixed(1)} KB · 点击可更换文件`;
    renderResults($(".res", md5), []);
  });
  const segment = $(".seg", md5);
  segment.addEventListener("click", () => {
    const isFile = activeIndex(segment) === 1;
    textBox.classList.toggle("hide", isFile);
    drop.classList.toggle("hide", !isFile);
    renderResults($(".res", md5), []);
  });
  const md5Buttons = $$(".bar button", md5);
  md5Buttons[0].onclick = () =>
    act(md5Buttons[0], async () => {
      const isFile = activeIndex(segment) === 1;
      if (isFile && !file) throw new Error("请先选择文件");
      renderResults(
        $(".res", md5),
        await md5Results(isFile ? file : $("textarea", md5).value),
      );
      notify("MD5 计算完成");
    });
  md5Buttons[1].onclick = () => {
    $("textarea", md5).value = "";
    file = undefined;
    $("b", drop).textContent = "拖入文件，或点击选择";
    $("span", drop).textContent = "本地分块计算，不上传文件";
    renderResults($(".res", md5), []);
  };
}
