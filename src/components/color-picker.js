import { $, notify } from "../dom.js";

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

export function initColorPicker(palette, onChange, initialColor = "#000000") {
  palette.append($("#color-picker-fields").content.cloneNode(true));
  const hex = $("[data-picker-hex]", palette);
  const rgb = [...palette.querySelectorAll(".watermark-rgb input")];
  const presets = $(".watermark-presets", palette);
  const plane = $(".watermark-color-plane", palette);
  const hueSlider = $(".watermark-hue", palette);
  const eyedropper = $(".watermark-eyedropper", palette);
  let color = initialColor.toLowerCase();
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
    for (const button of presets.children) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.color === value),
      );
    }
    onChange(color);
  };
  const chooseColor = () => {
    update(pickerHex(hue, saturation, brightness), undefined, true);
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
    button.onclick = () => update(value);
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
  update(color);
  return (value) => update(value.toLowerCase());
}
