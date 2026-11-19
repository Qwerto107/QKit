import { $, act, copy, download, icon, renderResults } from "../dom.js";
import { initColorPicker } from "../components/color-picker.js";
import { bindLocalFiles, openBitmap } from "./media.js";
import { REGEX_FLAGS } from "./regex.js";
import {
  convertColor,
  convertInteger,
  createIdentifier,
  decodeJwt,
  describeJsonError,
  formatJson,
  jsonLevelTokens,
} from "./dev-values.js";

function bindJsonHighlight(output) {
  const editor = document.createElement("div");
  editor.className = "json-result-editor";
  const highlight = document.createElement("pre");
  highlight.className = "json-highlight";
  highlight.setAttribute("aria-hidden", "true");
  highlight.hidden = true;
  output.before(editor);
  editor.append(highlight, output);

  // 高亮层与文本框共用换行和滚动，文本框继续负责选中、复制和拖动。
  const sync = () => {
    highlight.style.width = `${output.clientWidth}px`;
    highlight.style.height = `${output.clientHeight}px`;
    highlight.scrollTop = output.scrollTop;
    highlight.scrollLeft = output.scrollLeft;
  };
  output.addEventListener("scroll", sync);
  if (typeof ResizeObserver === "function") new ResizeObserver(sync).observe(output);
  let previous = "";
  return () => {
    const text = output.value;
    if (text === previous) return;
    previous = text;
    highlight.replaceChildren();
    highlight.hidden = true;
    // 大结果仍可滚动和复制，避免为密集的 JSON 构建大量高亮节点。
    if (!text || text.length > 100_000) return;
    try {
      JSON.parse(text);
    } catch {
      return;
    }

    const content = document.createDocumentFragment();
    let cursor = 0;
    for (const { token, index, level } of jsonLevelTokens(text)) {
      if (index > cursor) content.append(text.slice(cursor, index));
      const span = document.createElement("span");
      span.className = `json-level-${level % 5}`;
      span.textContent = token;
      content.append(span);
      cursor = index + token.length;
    }
    content.append(text.slice(cursor));
    highlight.replaceChildren(content);
    highlight.hidden = false;
    sync();
  };
}

function revealJsonError(input, start, end) {
  const style = getComputedStyle(input);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  marker.textContent = input.value.slice(start, end) || "\u200b";
  // 按文本框实际宽度测量自动折行后的坐标，单行压缩 JSON 也能定位。
  Object.assign(mirror.style, {
    position: "fixed",
    top: "0",
    left: "0",
    visibility: "hidden",
    pointerEvents: "none",
    boxSizing: "border-box",
    width: `${input.clientWidth}px`,
    padding: style.padding,
    font: style.font,
    letterSpacing: style.letterSpacing,
    tabSize: style.tabSize,
    whiteSpace: style.whiteSpace,
    overflowWrap: style.overflowWrap,
    wordBreak: style.wordBreak,
  });
  mirror.append(input.value.slice(0, start), marker, input.value.slice(end));
  document.body.append(mirror);
  const top = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
  mirror.remove();

  input.focus({ preventScroll: true });
  input.setSelectionRange(start, end);
  input.scrollTop = top - input.clientHeight / 2;
  input.scrollIntoView({ block: "nearest" });
}

function initJson(panel) {
  const input = $("textarea", panel);
  const output = $("textarea[readonly]", panel);
  const status = $("[data-status]", panel);
  const indent = $("[data-json-indent]", panel);
  const diagnostic = $("[data-json-diagnostic]", panel);
  const errorText = $("[data-json-error]", panel);
  const location = $("[data-json-location]", panel);
  const context = $("[data-json-context]", panel);
  const nativeError = $("[data-json-error-message]", panel);
  const jump = $("[data-json-jump]", panel);
  const refreshHighlight = bindJsonHighlight(output);
  const clearDiagnostic = () => {
    diagnostic.hidden = true;
    input.removeAttribute("aria-invalid");
    status.textContent = "";
  };
  input.addEventListener("input", () => {
    clearDiagnostic();
    refreshHighlight();
  });
  for (const mode of ["format", "minify", "validate"]) {
    $(`[data-json-${mode}]`, panel).onclick = () => {
      clearDiagnostic();
      try {
        if (input.value.length > 1_000_000)
          throw new Error("JSON 文本最多支持 100 万字符");
        if (mode === "validate") JSON.parse(input.value);
        else {
          const spacing =
            mode === "minify"
              ? ""
              : indent.value === "tab"
                ? "\t"
                : " ".repeat(Number(indent.value));
          output.value = formatJson(input.value, spacing);
        }
        status.textContent = "JSON 语法有效";
      } catch (error) {
        output.value = "";
        if (error instanceof SyntaxError) {
          const details = describeJsonError(input.value, error.message);
          errorText.textContent = details.reason;
          nativeError.textContent = error.message;
          const hasPosition = details.position !== null;
          context.hidden = location.hidden = jump.hidden = !hasPosition;
          if (hasPosition) {
            location.textContent = `第 ${details.line} 行 · 第 ${details.column} 列`;
            const mark = document.createElement("mark");
            mark.textContent = details.marked || "文末";
            context.replaceChildren(details.before, mark, details.after);
            jump.onclick = () => revealJsonError(input, details.position, details.end);
          }
          input.setAttribute("aria-invalid", "true");
          diagnostic.hidden = false;
        } else {
          status.textContent = error.message;
        }
      }
      refreshHighlight();
    };
  }
}

function initJwt(panel) {
  const token = $("[data-jwt-token]", panel);
  const result = $("[data-jwt-result]", panel);
  const status = $("[data-status]", panel);
  $("[data-jwt-decode]", panel).onclick = () => {
    result.hidden = true;
    try {
      if (token.value.length > 100_000) throw new Error("JWT 文本过长");
      const { header, payload, timestamps } = decodeJwt(token.value);
      $("[data-jwt-header]", panel).value = JSON.stringify(header, null, 2);
      $("[data-jwt-payload]", panel).value = JSON.stringify(payload, null, 2);
      renderResults($("[data-jwt-time]", panel), timestamps);
      result.hidden = false;
      status.textContent = "已解码，未验证签名。时间以 UTC 显示。";
    } catch (error) {
      status.textContent = error.message;
    }
  };
}

function initIds(panel) {
  const [type, count] = ["[data-id-type]", "[data-id-count]"].map((selector) =>
    $(selector, panel),
  );
  const generate = $("[data-id-generate]", panel);
  const copyAll = $("[data-id-copy]", panel);
  const results = $("[data-id-results]", panel);
  let ids = [];
  generate.onclick = () =>
    act(generate, () => {
      const quantity = count.valueAsNumber;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100)
        throw new Error("生成数量必须是 1–100 的整数");
      ids = Array.from({ length: quantity }, () =>
        createIdentifier(type.value),
      );
      const rows = ids.map((id, i) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "r id-copy-row";
        row.setAttribute("aria-label", `复制 ${id}`);
        const number = document.createElement("em");
        number.textContent = String(i + 1);
        const value = document.createElement("code");
        value.textContent = id;
        row.innerHTML = icon("copy");
        row.prepend(number, value);
        row.onclick = () => act(row, () => copy(id));
        return row;
      });
      results.replaceChildren(...rows);
      results.hidden = false;
    });
  copyAll.onclick = () => act(copyAll, () => copy(ids.join("\n")));
}

function initQrCode(panel) {
  const input = $("[data-qrcode-input]", panel);
  const image = $("[data-qrcode-image]", panel);
  const generate = $("[data-qrcode-make]", panel);
  const save = $("[data-qrcode-download]", panel);
  let png;
  let url;
  generate.onclick = () =>
    act(generate, async () => {
      const text = input.value;
      if (!text.trim()) throw new Error("请输入要编码的文本或链接");
      if (new TextEncoder().encode(text).length > 2000)
        throw new Error("二维码内容最多支持 2000 字节");
      const { makeQr } = await import("./qr-codec.js");
      png = await makeQr(text);
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(png);
      image.src = url;
      image.hidden = save.disabled = false;
    });
  save.onclick = () => download(png, "qkit-qr.png");

  const result = $("[data-qrcode-result]", panel);
  const output = $("textarea", result);
  const status = $("[data-status]", panel);
  const copyButton = $("[data-qrcode-copy]", panel);
  const drop = $("[data-qrcode-drop]", panel);
  const scanMode = $("#qrcode-mode-scan");
  let version = 0;
  bindLocalFiles(
    drop,
    $("[data-qrcode-file]", panel),
    async ([file]) => {
      if (scanMode.classList.contains("hide")) return;
      const ticket = ++version;
      result.hidden = copyButton.disabled = true;
      output.value = "";
      status.textContent = "正在识别……";
      try {
        const bitmap = await openBitmap(file);
        let pixels;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0);
          pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } finally {
          bitmap.close();
        }
        const { scanQr } = await import("./qr-codec.js");
        const codes = await scanQr(pixels);
        if (ticket !== version) return;
        if (!codes.length) throw new Error("未识别到二维码");
        output.value = codes.map(({ text }) => text).join("\n\n");
        status.textContent = `识别到 ${codes.length} 个二维码`;
        result.hidden = copyButton.disabled = false;
      } catch (error) {
        if (ticket === version) status.textContent = error.message;
      }
    },
    { paste: true },
  );
  copyButton.onclick = () => act(copyButton, () => copy(output.value));
}

function initDiff(panel) {
  const before = $("[data-diff-before]", panel);
  const after = $("[data-diff-after]", panel);
  const output = $("[data-diff-output]", panel);
  const status = $("[data-status]", panel);
  const compare = $("[data-diff-compare]", panel);
  const copyDiff = $("[data-diff-copy]", panel);
  let patch = "";
  compare.onclick = async () => {
    compare.disabled = true;
    output.hidden = true;
    patch = "";
    status.textContent = "正在比较……";
    try {
      if (before.value.length + after.value.length > 300_000)
        throw new Error("两份文本合计最多 30 万字符");
      const { diffLines } = await import("diff");
      const changes = diffLines(before.value, after.value, {
        stripTrailingCr: true,
        timeout: 500,
      });
      if (!changes) throw new Error("文本差异太多，请分段比较");
      const nodes = document.createDocumentFragment();
      const lines = [];
      let added = 0;
      let removed = 0;
      for (const change of changes) {
        if (change.added) added += change.count;
        if (change.removed) removed += change.count;
        const prefix = change.added ? "+ " : change.removed ? "- " : "  ";
        const block = document.createElement("span");
        block.className = change.added
          ? "diff-added"
          : change.removed
            ? "diff-removed"
            : "";
        block.textContent = change.value
          .replace(/^/gm, prefix)
          .replace(/\n[+ -] $/, "\n");
        if (!block.textContent.endsWith("\n")) block.textContent += "\n";
        lines.push(block.textContent);
        nodes.append(block);
      }
      patch = lines.join("");
      output.replaceChildren(nodes);
      output.hidden = !(added || removed);
      status.textContent =
        added || removed
          ? `新增 ${added} 行，删除 ${removed} 行`
          : "两份文本一致";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      compare.disabled = false;
    }
  };
  copyDiff.onclick = () =>
    act(copyDiff, () => copy(output.hidden ? "" : patch));
}

function createRegexWorker(syntax) {
  if (syntax === "pcre2")
    return new Worker(new URL("./regex-worker-pcre.js", import.meta.url), {
      type: "module",
    });
  if (syntax === "re2")
    return new Worker(new URL("./regex-worker-re2.js", import.meta.url), {
      type: "module",
    });
  return new Worker(new URL("./regex-worker.js", import.meta.url), { type: "module" });
}

function matchInWorker(syntax, input) {
  return new Promise((resolve, reject) => {
    const worker = createRegexWorker(syntax);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const fail = (message) => {
      finish();
      reject(new Error(message));
    };
    let timer = setTimeout(() => fail("正则引擎加载超时"), 15000);
    worker.onmessage = ({ data }) => {
      if (data.ready) {
        clearTimeout(timer);
        timer = setTimeout(() => fail("匹配超时，请简化表达式或缩短文本"), 1500);
        worker.postMessage(input);
        return;
      }
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = () => fail("无法启动正则测试");
  });
}

function initRegex(panel) {
  const syntax = $("[data-regex-syntax]", panel);
  const pattern = $("[data-regex-pattern]", panel);
  const flags = $("[data-regex-flags]", panel);
  const source = $("[data-regex-text]", panel);
  const run = $("[data-regex-run]", panel);
  const preview = $("[data-regex-preview]", panel);
  const groups = $("[data-regex-groups]", panel);
  const status = $("[data-status]", panel);
  const supportedFlags = $("[data-regex-supported-flags]", panel);
  const syncSyntax = () => {
    const modifiers = REGEX_FLAGS[syntax.value];
    pattern.placeholder = syntax.value === "javascript" ? "(?<word>\\w+)" : "(?P<word>\\w+)";
    supportedFlags.textContent = `支持 ${modifiers.split("").join("、")}。g 查找全部匹配。`;
    preview.hidden = groups.hidden = true;
    status.textContent = "";
  };
  syntax.addEventListener("change", syncSyntax);
  syncSyntax();
  run.onclick = async () => {
    run.disabled = true;
    preview.hidden = groups.hidden = true;
    status.textContent = "正在匹配……";
    const selectedSyntax = syntax.value;
    try {
      const text = source.value;
      const { hits, truncated } = await matchInWorker(selectedSyntax, {
        pattern: pattern.value,
        flags: flags.value.trim(),
        text,
      });
      if (syntax.value !== selectedSyntax) return;
      const marked = document.createDocumentFragment();
      let cursor = 0;
      for (const { start, end } of hits) {
        const mark = document.createElement("mark");
        mark.textContent = start === end ? "▏" : text.slice(start, end);
        if (start === end) mark.title = "零长度匹配";
        marked.append(text.slice(cursor, start), mark);
        cursor = end;
      }
      marked.append(text.slice(cursor));
      preview.replaceChildren(marked);
      preview.hidden = false;
      const show = (value) =>
        value === undefined ? "未匹配" : JSON.stringify(value);
      const entries = hits.map(({ start, end, groups: captures, named }, i) => {
        const parts = [
          `匹配 ${show(text.slice(start, end))}（${start}–${end}）`,
          ...captures.map((value, index) => `$${index + 1}: ${show(value)}`),
          ...named.map(([name, value]) => `${name}: ${show(value)}`),
        ];
        return [`#${i + 1}`, parts.join("\n")];
      });
      renderResults(groups, entries);
      status.textContent = truncated
        ? "仅展示前 200 个匹配"
        : `找到 ${hits.length} 个匹配`;
    } catch (error) {
      if (syntax.value === selectedSyntax) status.textContent = error.message;
    } finally {
      run.disabled = false;
    }
  };
}

function initConversions(panel) {
  const base = $("[data-radix-base]", panel);
  const integer = $("[data-radix-input]", panel);
  const radix = $("[data-radix-run]", panel);
  const radixResult = $("[data-radix-results]", panel);
  radix.onclick = () =>
    act(radix, () => {
      radixResult.hidden = true;
      const values = convertInteger(integer.value, Number(base.value));
      renderResults(
        radixResult,
        ["二进制", "八进制", "十进制", "十六进制"].map((label, i) => [
          label,
          values[i],
        ]),
      );
    });
  const color = $("[data-color-input]", panel);
  const colorRun = $("[data-color-run]", panel);
  const swatch = $("[data-color-swatch]", panel);
  const colorResult = $("[data-color-results]", panel);
  const palette = $("[data-conversion-palette]", panel);
  const showColor = (value) => {
    const { hex, rgb, hsl } = convertColor(value);
    swatch.style.backgroundColor = hex;
    swatch.setAttribute("aria-label", `颜色预览 ${hex}`);
    swatch.hidden = false;
    renderResults(colorResult, [["HEX", hex], ["RGB", rgb], ["HSL", hsl]]);
  };
  const setPicker = initColorPicker(
    palette,
    (value) => {
      color.value = value.toUpperCase();
      showColor(value);
    },
    "#3B82F6",
  );
  colorRun.onclick = () =>
    act(colorRun, () => {
      setPicker(convertColor(color.value).hex);
    });
}

export async function cronDates(expression, zone, currentDate = new Date()) {
  const value = expression.trim();
  if (
    !value ||
    value.length > 120 ||
    ![5, 6].includes(value.split(/\s+/).length)
  )
    throw new Error("请输入 5 字段或含秒的 6 字段 Cron 表达式");
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: zone,
  });
  const { CronExpressionParser } = await import("cron-parser");
  return CronExpressionParser.parse(value, { tz: zone, currentDate })
    .take(5)
    .map((date) => formatter.format(date.toDate()));
}

function initCron(panel) {
  const expression = $("[data-cron-expression]", panel);
  const zone = $("[data-cron-zone]", panel);
  const run = $("[data-cron-run]", panel);
  const status = $("[data-status]", panel);
  const results = $("[data-cron-results]", panel);
  run.onclick = async () => {
    run.disabled = true;
    results.hidden = true;
    status.textContent = "正在解析……";
    try {
      const tz = zone.value.trim() || "UTC";
      const dates = await cronDates(expression.value, tz);
      if (!dates.length) throw new Error("找不到可执行的日期");
      renderResults(
        results,
        dates.map((date, i) => [`#${i + 1}`, date]),
      );
      status.textContent = `接下来 ${dates.length} 次执行 · ${tz}`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      run.disabled = false;
    }
  };
}

export function initDevelopers() {
  initJson($("#json"));
  initJwt($("#jwt"));
  initIds($("#ids"));
  initQrCode($("#qrcode"));
  initDiff($("#diff"));
  initRegex($("#regex"));
  initConversions($("#convert"));
  initCron($("#cron"));
}
