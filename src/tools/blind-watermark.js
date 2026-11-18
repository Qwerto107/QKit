import { $, download, notify } from "../dom.js";
import {
  bindLocalFiles,
  bindImagePreview,
  canvasPng,
  checkImageSize,
  openBitmap,
  validateImage,
} from "./media.js";

const CHANNELS = ["Red", "Green", "Blue", "Alpha"];
const MODES = [
  { label: "原图" },
  { label: "反色", id: "inverse" },
  { label: "灰色像素", id: "gray" },
  { label: "随机色图 1", id: "colors-1" },
  { label: "随机色图 2", id: "colors-2" },
  ...CHANNELS.map((label, channel) => ({
    label: `${label} Channel`,
    id: `full-${"RGBA"[channel]}`,
    channel,
  })),
  ...[0, 1, 2].flatMap((bit) =>
    CHANNELS.map((label, channel) => ({
      label: `${label} Plane ${bit}`,
      id: `${"RGBA"[channel]}${bit}`,
      channel,
      bit,
    })),
  ),
];

export function renderBitPlane(image, channel, bit, output) {
  renderImageMode(image, { channel, bit }, output);
}

function renderImageMode(image, { id, channel, bit }, output) {
  const { data, width, height, channels, depth, transparency } = image;
  const gray = channels <= 2;
  const hasAlpha = channels % 2 === 0;
  const mask = (1 << depth) - 1;
  const rowBytes = Math.ceil((width * depth) / 8);
  const lowDepth = depth < 8;
  const normalize = depth === 16 ? 1 / 257 : 1;
  const remap = id?.startsWith("colors-")
    ? Array.from({ length: 3 }, () => {
        const multiplier = 2 * Math.floor(Math.random() * 128) + 1;
        const offset = Math.floor(Math.random() * 256);
        return Uint8Array.from(
          { length: 256 },
          (_, i) => (i * multiplier + offset) & 255,
        );
      })
    : null;
  for (let i = 0, pixel = 0; i < width * height; i++, pixel += 4) {
    const offset = i * channels;
    // PNG 低于 8 位的灰度样本按行打包；保留 16 位样本的原始低位。
    const x = lowDepth ? i % width : 0;
    const graySample =
      depth >= 8
        ? data[offset]
        : (data[
            Math.floor(i / width) * rowBytes + Math.floor((x * depth) / 8)
          ] >>
            (8 - depth - ((x * depth) % 8))) &
          mask;
    const r = lowDepth ? (graySample * 255) / mask : data[offset];
    const g = gray ? r : data[offset + 1];
    const b = gray ? r : data[offset + 2];
    const hidden =
      transparency?.length &&
      (gray
        ? transparency[0] === graySample
        : transparency[0] === r &&
          transparency[1] === g &&
          transparency[2] === b);
    const alpha = hasAlpha ? data[offset + channels - 1] : hidden ? 0 : mask;
    if (bit !== undefined) {
      const sample =
        channel === 0
          ? r
          : channel === 1
            ? g
            : channel === 2
              ? b
              : hasAlpha
                ? alpha
                : hidden
                  ? 0
                  : 255;
      const value = ((sample >> bit) & 1) * 255;
      output[pixel] = output[pixel + 1] = output[pixel + 2] = value;
    } else if (channel !== undefined) {
      output[pixel] =
        channel === 0
          ? r * normalize
          : channel === 3
            ? (alpha * 255) / mask
            : 0;
      output[pixel + 1] = channel === 1 ? g * normalize : 0;
      output[pixel + 2] = channel === 2 ? b * normalize : 0;
    } else if (id === "gray") {
      output[pixel] =
        output[pixel + 1] =
        output[pixel + 2] =
          r === g && g === b ? 255 : 0;
    } else if (remap) {
      output[pixel] = remap[0][Math.round(r * normalize)];
      output[pixel + 1] = remap[1][Math.round(g * normalize)];
      output[pixel + 2] = remap[2][Math.round(b * normalize)];
    } else {
      output[pixel] = 255 - r * normalize;
      output[pixel + 1] = 255 - g * normalize;
      output[pixel + 2] = 255 - b * normalize;
    }
    output[pixel + 3] = 255;
  }
}

async function readPixels(file) {
  validateImage(file);
  const header = new DataView(await file.slice(0, 24).arrayBuffer());
  if (
    header.byteLength === 24 &&
    header.getUint32(0) === 0x89504e47 &&
    header.getUint32(4) === 0x0d0a1a0a
  ) {
    checkImageSize(header.getUint32(16), header.getUint32(20));
    // 直接解码 PNG，以免 Canvas 的色彩转换和预乘透明度改动低位。
    const { decode, convertIndexedToRgb } = await import("fast-png");
    const image = decode(await file.arrayBuffer());
    return image.palette
      ? {
          ...image,
          data: convertIndexedToRgb(image),
          channels: image.palette[0].length,
          depth: 8,
          transparency: undefined,
        }
      : image;
  }
  const bitmap = await openBitmap(file, { colorSpaceConversion: "none" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return { data, width, height, channels: 4, depth: 8 };
  } finally {
    bitmap.close();
  }
}

export function initBlindWatermark() {
  const panel = $("#blind-watermark");
  const fileInput = $("#blind-file");
  const result = $("#blind-result");
  const original = $("#blind-original");
  const canvas = $("#blind-plane");
  const select = $("#blind-select");
  const downloadButton = $("#blind-download");
  const setPreviewSize = bindImagePreview($(".image-zoom-preview", result));
  MODES.forEach(({ label }) => select.add(new Option(label)));
  let source, pixels, filename, url;
  let revision = 0;
  const render = () => {
    if (!source) return;
    const mode = MODES[select.selectedIndex];
    original.hidden = Boolean(mode.id);
    downloadButton.disabled = canvas.hidden = !mode.id;
    $("#blind-mode").textContent = `${source.width} × ${source.height}`;
    if (!mode.id) return;
    const ctx = canvas.getContext("2d");
    pixels ??= ctx.createImageData(source.width, source.height);
    renderImageMode(source, mode, pixels.data);
    ctx.putImageData(pixels, 0, 0);
  };
  select.onchange = render;
  const switchMode = (step) => {
    if (!source) return;
    select.selectedIndex =
      (select.selectedIndex + step + MODES.length) % MODES.length;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  $("#blind-prev").onclick = () => switchMode(-1);
  $("#blind-next").onclick = () => switchMode(1);
  document.addEventListener("keydown", (event) => {
    if (
      !panel.classList.contains("on") ||
      !source ||
      event.defaultPrevented ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.target.closest?.(
        "input, textarea, [contenteditable], [aria-expanded='true']",
      )
    )
      return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    switchMode(event.key === "ArrowLeft" ? -1 : 1);
  });
  bindLocalFiles(
    $("#blind-drop"),
    fileInput,
    async ([file]) => {
      const ticket = ++revision;
      let next;
      try {
        next = await readPixels(file);
      } catch (error) {
        if (ticket === revision) notify(`无法查看图片：${error.message}`, true);
        return;
      }
      if (ticket !== revision) return;
      source = next;
      filename = file.name.replace(/\.[^.]+$/, "");
      canvas.width = source.width;
      canvas.height = source.height;
      pixels = null;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(file);
      original.src = url;
      result.hidden = false;
      select.selectedIndex = 0;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      setPreviewSize(source.width, source.height);
    },
    { paste: true },
  );
  downloadButton.onclick = async () => {
    const name = `${filename}-${MODES[select.selectedIndex].id}.png`;
    try {
      download(await canvasPng(canvas), name);
    } catch (error) {
      notify(error.message, true);
    }
  };
  $("#blind-clear").onclick = () => {
    revision++;
    URL.revokeObjectURL(url);
    original.removeAttribute("src");
    url = source = pixels = null;
    canvas.width = canvas.height = 0;
    result.hidden = true;
  };
}
