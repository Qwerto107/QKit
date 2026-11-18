import { $, activeIndex, download, icon, notify } from "../dom.js";
import {
  bindLocalFiles,
  bindImagePreview,
  canvasPng,
  numberField,
  openBitmap,
} from "./media.js";

function wrapText(ctx, text, maxWidth) {
  return text.split(/\r?\n/).flatMap((paragraph) => {
    const lines = [];
    let line = "";
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    return [...lines, line];
  });
}

const COLORS = [
  "#000000",
  "#ffffff",
  "#64748b",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
];

function toHex(channels) {
  return `#${channels.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function pickerHex(hue, saturation, brightness) {
  // 色盘水平方向增加饱和度，垂直方向从亮到暗。
  const chroma = brightness * saturation;
  const middle = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const channels = [
    [chroma, middle, 0],
    [middle, chroma, 0],
    [0, chroma, middle],
    [0, middle, chroma],
    [middle, 0, chroma],
    [chroma, 0, middle],
  ][Math.floor(hue / 60)];
  return toHex(channels.map((value) => (value + brightness - chroma) * 255));
}

function initWatermarkColor(settings) {
  const trigger = $("#watermark-color-toggle");
  const palette = $("#watermark-palette");
  const hex = $("#watermark-color");
  const rgb = [...palette.querySelectorAll(".watermark-rgb input")];
  const label = $("#watermark-color-value");
  const presets = $(".watermark-presets", palette);
  const plane = $(".watermark-color-plane", palette);
  const hueSlider = $(".watermark-hue", palette);
  const eyedropper = $(".watermark-eyedropper", palette);
  let color = hex.value;
  let hue = 0;
  let saturation = 0;
  let brightness = 0;
  const syncPicker = (value) => {
    const [r, g, b] = value
      .slice(1)
      .match(/../g)
      .map((part) => parseInt(part, 16) / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    brightness = max;
    saturation = max ? delta / max : 0;
    if (delta) {
      const sector =
        max === r
          ? (g - b) / delta
          : max === g
            ? 2 + (b - r) / delta
            : 4 + (r - g) / delta;
      hue = (sector * 60 + 360) % 360;
    }
  };
  const syncInputs = (except) => {
    if (except !== hex) hex.value = color.toUpperCase();
    rgb.forEach((input, i) => {
      if (input !== except)
        input.value = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16);
    });
  };
  const update = (value, source, fromPicker = false) => {
    color = value;
    if (!fromPicker) syncPicker(value);
    hueSlider.value = Math.min(359, Math.round(hue));
    plane.style.setProperty("--picker-hue", hue);
    plane.style.setProperty("--picker-x", `${saturation * 100}%`);
    plane.style.setProperty("--picker-y", `${(1 - brightness) * 100}%`);
    plane.style.setProperty("--picker-color", color);
    syncInputs(source);
    trigger.style.setProperty("--watermark-color", value);
    label.textContent = value.toUpperCase();
    for (const button of presets.children) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.color === value),
      );
    }
  };
  const toggle = (open) => {
    palette.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
  };
  const chooseColor = () => {
    update(pickerHex(hue, saturation, brightness), undefined, true);
    settings.dispatchEvent(new Event("change"));
  };
  const movePicker = (event) => {
    const { left, top, width, height } = plane.getBoundingClientRect();
    const fraction = (value) => Math.min(1, Math.max(0, value));
    saturation = fraction((event.clientX - left) / width);
    brightness = 1 - fraction((event.clientY - top) / height);
    chooseColor();
  };
  plane.onpointerdown = (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    plane.setPointerCapture(event.pointerId);
    movePicker(event);
  };
  plane.onpointermove = (event) => {
    if (plane.hasPointerCapture(event.pointerId)) movePicker(event);
  };
  hueSlider.oninput = () => {
    hue = hueSlider.valueAsNumber;
    chooseColor();
  };
  if (typeof window.EyeDropper === "function") {
    eyedropper.hidden = false;
    eyedropper.onclick = async () => {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        update(sRGBHex.toLowerCase());
        settings.dispatchEvent(new Event("change"));
      } catch (error) {
        if (error.name !== "AbortError")
          notify("暂时无法使用吸管，请在色盘上选色", true);
      }
    };
  }
  for (const value of COLORS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.color = value;
    button.style.setProperty("--watermark-color", value);
    button.setAttribute("aria-label", value.toUpperCase());
    button.onclick = () => {
      update(value);
      settings.dispatchEvent(new Event("change"));
      toggle(false);
      trigger.focus();
    };
    presets.append(button);
  }
  hex.oninput = () => {
    const value = hex.value.trim().replace(/^#/, "").toLowerCase();
    if (/^[a-f0-9]{6}$/.test(value)) update(`#${value}`, hex);
    else if (/^[a-f0-9]{3}$/.test(value)) {
      update(`#${[...value].map((char) => char.repeat(2)).join("")}`, hex);
    }
  };
  hex.onblur = () => syncInputs();
  for (const input of rgb) {
    input.oninput = () => {
      if (!input.value || !input.validity.valid) return;
      const start = 1 + rgb.indexOf(input) * 2;
      const channel = Number(input.value).toString(16).padStart(2, "0");
      update(color.slice(0, start) + channel + color.slice(start + 2), input);
    };
    input.onblur = () => syncInputs();
  }
  trigger.onclick = () => toggle(palette.hidden);
  const control = trigger.parentElement;
  control.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || palette.hidden) return;
    toggle(false);
    trigger.focus();
  });
  control.addEventListener("focusout", (event) => {
    if (!control.contains(event.relatedTarget)) toggle(false);
  });
  document.addEventListener("click", (event) => {
    if (!control.contains(event.target)) toggle(false);
  });
  update(color);
  return () => color;
}

export function drawWatermark(canvas, image, options, scale = 1) {
  const { width, height } = image;
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.drawImage(image, 0, 0, width, height);
  if (!options.text.trim() || options.opacity === 0) return;

  const shortEdge = Math.min(width, height);
  let size = Math.max(1, (shortEdge * options.size) / 100);
  const setFont = () => {
    ctx.font = `600 ${size}px system-ui, sans-serif`;
  };
  setFont();
  const lines = wrapText(ctx, options.text.trim(), width * 0.75);
  const boxWidth = Math.max(
    ...lines.map((line) => ctx.measureText(line).width),
  );
  const boxHeight = size * 1.25 * lines.length;
  const angle = (options.angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const rotatedWidth = boxWidth * cos + boxHeight * sin;
  const rotatedHeight = boxWidth * sin + boxHeight * cos;
  const pad = shortEdge * 0.035;
  const fit = Math.min(
    1,
    (width - pad * 2) / rotatedWidth,
    (height - pad * 2) / rotatedHeight,
  );
  size *= fit;
  setFont();
  const halfX = (rotatedWidth * fit) / 2;
  const halfY = (rotatedHeight * fit) / 2;
  ctx.fillStyle = options.color;
  ctx.globalAlpha = options.opacity / 100;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const paintText = (x, y) => {
    lines.forEach((line, i) =>
      ctx.fillText(line, x, y + (i - (lines.length - 1) / 2) * size * 1.25),
    );
  };
  const paint = (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    paintText(0, 0);
    ctx.restore();
  };
  if (options.mode === 0) {
    // 在旋转后的画布上平铺，四边都画到画布外，让画布裁掉超出的部分。
    const extentX = (width * cos + height * sin) / 2;
    const extentY = (width * sin + height * cos) / 2;
    const stepX = Math.max(extentX / 32, boxWidth * fit + size * options.gap);
    const stepY = Math.max(extentY / 32, boxHeight * fit + size * options.gap);
    const columns = Math.ceil(extentX / stepX);
    const rows = Math.ceil(extentY / stepY);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);
    for (let row = -rows; row <= rows; row++) {
      for (let col = -columns; col <= columns; col++) {
        paintText(col * stepX, row * stepY);
      }
    }
    ctx.restore();
  } else if (options.mode === 1) {
    const x = options.position.endsWith("left")
      ? pad + halfX
      : options.position.endsWith("right")
        ? width - pad - halfX
        : width / 2;
    const y = options.position.startsWith("top")
      ? pad + halfY
      : options.position.startsWith("bottom")
        ? height - pad - halfY
        : height / 2;
    paint(x, y);
  } else {
    const columns = Math.min(
      options.count,
      Math.ceil(Math.sqrt((options.count * width) / height)),
    );
    const rows = Math.ceil(options.count / columns);
    // 自定义数量时让每行居中，并缩放水印使其适配分区。
    size *= Math.min(
      1,
      width / columns / (halfX * 2 + pad),
      height / rows / (halfY * 2 + pad),
    );
    setFont();
    for (let row = 0; row < rows; row++) {
      const cells = Math.min(columns, options.count - row * columns);
      for (let col = 0; col < cells; col++)
        paint(((col + 0.5) * width) / cells, ((row + 0.5) * height) / rows);
    }
  }
  ctx.globalAlpha = 1;
}

function outputName(name) {
  const stem = name
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .slice(0, 100);
  return `${stem || "图片"}-水印.png`;
}

export function initWatermark() {
  const gallery = $("#watermark-gallery");
  const settings = $("#watermark .media-settings");
  const layout = $("#watermark .seg");
  const clear = $("#watermark-clear");
  const batch = $("#watermark-download");
  const getColor = initWatermarkColor(settings);
  const items = [];
  let loading = false;
  let exporting = false;
  let redraw;
  const currentOptions = () => ({
    text: $("#watermark-text").value,
    color: getColor(),
    size: numberField("watermark-size"),
    angle: numberField("watermark-angle"),
    opacity: numberField("watermark-opacity"),
    gap: numberField("watermark-gap"),
    count: numberField("watermark-count"),
    position: $("#watermark-position").value,
    mode: activeIndex(layout),
  });
  const update = () => {
    clear.disabled = batch.disabled = loading || exporting || !items.length;
    for (const item of items) item.remove.disabled = loading || exporting;
  };
  const render = () => {
    cancelAnimationFrame(redraw);
    redraw = requestAnimationFrame(() => {
      const options = currentOptions();
      for (const item of items) drawPreview(item, options);
    });
  };
  settings.addEventListener("input", render);
  settings.addEventListener("change", render);
  layout.addEventListener("click", render);
  const drawPreview = (item, options) => {
    const { image, canvas } = item;
    const displayWidth = canvas.getBoundingClientRect().width || 1;
    const scale = Math.min(
      1,
      (displayWidth * (window.devicePixelRatio || 1)) / image.width,
    );
    drawWatermark(canvas, image, options, scale);
  };
  const exportImage = (item, options) => {
    const canvas = document.createElement("canvas");
    drawWatermark(canvas, item.image, options);
    return canvasPng(canvas).finally(() => {
      canvas.width = canvas.height = 0;
    });
  };
  const add = (file, image) => {
    const tile = document.createElement("article");
    tile.className = "media-tile";
    tile.innerHTML = `<div class="fh"><span></span><button class="mini" aria-label="移除图片">${icon("trash")}</button></div><div class="media-preview image-zoom-preview" tabindex="0" aria-label="图片预览，滚轮或加减键缩放，放大后拖动，双击还原"><canvas aria-label="带水印的图片预览"></canvas></div><div class="media-tile-actions"><button class="btn">${icon("dl")}下载 PNG</button></div>`;
    $(".fh span", tile).textContent = file.name;
    const remove = $(".mini", tile);
    const item = {
      image,
      canvas: $("canvas", tile),
      name: outputName(file.name),
      remove,
    };
    items.push(item);
    gallery.append(tile);
    const setPreviewSize = bindImagePreview(
      $(".image-zoom-preview", tile),
      () => drawPreview(item, currentOptions()),
    );
    setPreviewSize(image.width, image.height);
    remove.onclick = () => {
      image.close();
      items.splice(items.indexOf(item), 1);
      tile.remove();
      update();
    };
    const save = $(".btn", tile);
    save.onclick = async () => {
      save.disabled = true;
      try {
        download(await exportImage(item, currentOptions()), item.name);
      } catch (error) {
        notify(error.message, true);
      } finally {
        save.disabled = false;
      }
    };
  };
  bindLocalFiles(
    $("#watermark-drop"),
    $("#watermark-files"),
    async (files) => {
      if (loading || exporting) return;
      loading = true;
      update();
      const errors = [];
      try {
        const remaining = 12 - items.length;
        if (files.length > remaining) errors.push("最多同时处理 12 张图片");
        let totalPixels = items.reduce(
          (sum, { image }) => sum + image.width * image.height,
          0,
        );
        for (const file of files.slice(0, remaining)) {
          try {
            const image = await openBitmap(file);
            const pixels = image.width * image.height;
            if (totalPixels + pixels > 60_000_000) {
              image.close();
              errors.push("所选图片总尺寸过大，请分批处理");
              break;
            }
            add(file, image);
            totalPixels += pixels;
          } catch (error) {
            errors.push(error.message);
          }
        }
      } finally {
        loading = false;
        update();
      }
      if (errors.length) notify(errors.join("；"), true);
    },
    { paste: true },
  );
  clear.onclick = () => {
    items.splice(0).forEach(({ image }) => image.close());
    gallery.replaceChildren();
    update();
  };
  batch.onclick = async () => {
    exporting = true;
    update();
    try {
      const options = currentOptions();
      const { zipSync } = await import("fflate");
      const files = {};
      for (const [index, item] of items.entries()) {
        const blob = await exportImage(item, options);
        files[`${index + 1}-${item.name}`] = new Uint8Array(
          await blob.arrayBuffer(),
        );
      }
      download(
        zipSync(files, { level: 0 }),
        "QKit-水印图片.zip",
        "application/zip",
      );
    } catch (error) {
      notify(error.message, true);
    } finally {
      exporting = false;
      update();
    }
  };
}
