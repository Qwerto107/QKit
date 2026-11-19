import {
  $,
  $$,
  act,
  activeIndex,
  bindFileDrop,
  copy,
  download,
  icon,
  notify,
} from "../dom.js";

export function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function base64ToBytes(text) {
  const value = text.replace(/\s/g, "");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/.test(
      value,
    )
  ) {
    throw new Error("Base64 格式无效，请检查字符及末尾填充");
  }
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  if (bytesToBase64(bytes).replace(/=+$/, "") !== value.replace(/=+$/, ""))
    throw new Error("Base64 编码无效");
  return bytes;
}

export const encodeText = (text) =>
  bytesToBase64(new TextEncoder().encode(text));
export function decodeText(text) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      base64ToBytes(text),
    );
  } catch (error) {
    if (error instanceof TypeError)
      throw new Error(
        "解码结果不是有效的 UTF-8 文本，请使用图片模式或检查输入",
      );
    throw error;
  }
}

export function convertUrl(text, decode, fullUrl) {
  try {
    return decode
      ? fullUrl
        ? decodeURI(text)
        : decodeURIComponent(text)
      : fullUrl
        ? encodeURI(text)
        : encodeURIComponent(text);
  } catch {
    throw new Error("URL 编码无效，请检查 % 转义序列及输入字符");
  }
}

function urlQuery(text) {
  const source = text.trim().split("#", 1)[0];
  const separator = source.indexOf("?");
  const hasPath = /^(?:[a-z][a-z\d+.-]*:\/\/|\/|\.\.?\/)/i.test(source);
  // 裸参数的值也可能含有问号，例如 next=/search?q=term。
  const hasQuerySeparator =
    separator >= 0 && !/[=&]/.test(source.slice(0, separator));
  if (hasPath || hasQuerySeparator)
    return separator < 0 ? "" : source.slice(separator + 1);
  return /[=&]/.test(source) ? source : null;
}

export function parseUrlParameters(text) {
  // 优先按原始分隔符拆分，避免把参数值内解码出的 & 或 # 当作分隔符。
  let query = urlQuery(text);
  if (query === null && /%3[fd]/i.test(text)) {
    // 整体编码的 URL 要先还原一层，才能找到原本的查询分隔符。
    try {
      query = urlQuery(decodeURIComponent(text));
    } catch {
      return [];
    }
  }
  return [...new URLSearchParams(`?${query ?? ""}`)];
}

export function initCodecs() {
  const urlPanel = $("#url");
  const [urlInput, urlOutput] = $$("textarea", urlPanel);
  const urlMode = $(".seg", urlPanel);
  const [urlEncode, urlDecode, urlClear] = $$(".bar button", urlPanel);
  const urlParametersSection = $(".url-parameters", urlPanel);
  const urlParameters = $("[data-url-parameters]", urlPanel);
  const updateUrlParameters = () => {
    const parameters = parseUrlParameters(urlInput.value);
    const rows = document.createDocumentFragment();
    for (const [key, value] of parameters) {
      const row = document.createElement("tr");
      const name = row.insertCell();
      name.className = key ? "mono" : "url-parameter-empty";
      name.textContent = key || "空键名";

      const cell = document.createElement("div");
      cell.className = "url-parameter-value";
      const text = document.createElement("code");
      text.className = value ? "mono" : "url-parameter-empty";
      text.textContent = value || "空值";
      cell.append(text);
      if (value) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mini";
        button.setAttribute("aria-label", key ? `复制参数值 ${key}` : "复制参数值");
        button.innerHTML = icon("copy");
        button.onclick = () => act(button, () => copy(value));
        cell.append(button);
      }
      row.insertCell().append(cell);
      rows.append(row);
    }
    urlParameters.replaceChildren(rows);
    urlParametersSection.hidden = parameters.length === 0;
  };
  urlInput.addEventListener("input", updateUrlParameters);
  const convertUrlInput = (button, decode) =>
    act(button, () => {
      urlOutput.value = convertUrl(
        urlInput.value,
        decode,
        activeIndex(urlMode) === 1,
      );
      updateUrlParameters();
      notify("转换完成");
    });
  urlEncode.onclick = () => convertUrlInput(urlEncode, false);
  urlDecode.onclick = () => convertUrlInput(urlDecode, true);
  urlClear.onclick = () => {
    urlInput.value = urlOutput.value = "";
    updateUrlParameters();
  };

  const panel = $("#b64");
  const textMode = $(".seg", panel);
  const fields = $$("textarea", $("#b64m-txt"));
  const imageField = $("#b64m-pic textarea");
  imageField.readOnly = false;
  imageField.setAttribute("aria-label", "图片 Base64 或 Data URI");
  const drop = $(".drop", panel);
  const defaultDrop = drop.innerHTML;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";
  input.hidden = true;
  drop.after(input);
  let imageBlob = null;
  let imageName = "qkit-image.png";
  let previewUrl;
  let textDecoded = false;
  let imageResult;
  const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ];

  async function preview(blob, name) {
    if (blob.size > 20 * 1024 * 1024)
      throw new Error("请选择不超过 20 MB 的图片");
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.src = url;
    image.alt = name;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("无法识别图片，请检查文件内容或 Data URI 类型");
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = url;
    imageBlob = blob;
    imageName = name;
    const caption = document.createElement("span");
    caption.textContent = `${name} · ${image.naturalWidth} × ${image.naturalHeight}`;
    drop.replaceChildren(image, caption);
  }

  const encodeImage = async (blob) => {
    imageField.value = `data:${blob.type};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
    imageResult = "encoded";
  };
  bindFileDrop(drop, input, async (file) => {
    if (!allowedTypes.includes(file.type))
      throw new Error("仅支持 PNG、JPG、GIF、WebP 和 SVG 图片");
    await preview(file, file.name);
    await encodeImage(file);
    notify("图片已转为 Data URI");
  });
  $(".mini", $("#b64m-pic")).onclick = (event) => {
    const button = event.currentTarget;
    act(button, () => copy(imageField.value));
  };
  imageField.addEventListener("input", () => {
    imageBlob = null;
    imageResult = undefined;
  });
  const decodeImage = async () => {
    const match = imageField.value
      .trim()
      .match(
        /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([\s\S]*)$/i,
      );
    if (!match)
      throw new Error(
        "图片解码需要完整的 Data URI（包含 data:image/…;base64, 前缀）",
      );
    const type = match[1].toLowerCase();
    const extension = type === "image/svg+xml" ? "svg" : type.split("/")[1];
    await preview(
      new Blob([base64ToBytes(match[2])], { type }),
      `qkit-image.${extension}`,
    );
    imageResult = "decoded";
  };
  const [encodeButton, decodeButton, clearButton, downloadButton] = $$(
    ".bar button",
    panel,
  );
  const convert = (button, decode) =>
    act(button, async () => {
      if (activeIndex(textMode) === 0) {
        fields[1].value = decode
          ? decodeText(fields[0].value)
          : encodeText(fields[0].value);
        textDecoded = decode;
      } else if (decode) {
        await decodeImage();
      } else {
        if (!imageBlob) throw new Error("请先选择或拖入图片");
        await encodeImage(imageBlob);
      }
      notify("转换完成");
    });
  encodeButton.onclick = () => convert(encodeButton, false);
  decodeButton.onclick = () => convert(decodeButton, true);
  clearButton.onclick = () => {
    if (activeIndex(textMode) === 0)
      fields.forEach((field) => {
        field.value = "";
      });
    else {
      imageField.value = "";
      imageBlob = null;
      imageResult = undefined;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = undefined;
      drop.innerHTML = defaultDrop;
    }
  };
  downloadButton.onclick = () =>
    act(downloadButton, () => {
      if (activeIndex(textMode) === 0) {
        if (!fields[1].value) throw new Error("请先执行转换");
        download(
          fields[1].value,
          textDecoded ? "qkit-decoded.txt" : "qkit-base64.txt",
        );
      } else if (imageResult === "decoded") {
        download(imageBlob, imageName);
      } else {
        if (imageResult !== "encoded")
          throw new Error("请先选择图片或解码 Data URI");
        download(imageField.value, "qkit-image-base64.txt");
      }
    });
  drop.setAttribute("aria-label", "选择或拖入图片");
  input.setAttribute("aria-label", "选择图片文件");
}
