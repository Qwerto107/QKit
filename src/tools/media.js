import { $, notify } from "../dom.js";

export function bindLocalFiles(drop, input, load, { paste = false } = {}) {
  const choose = async (files) => {
    if (!files.length) return;
    try {
      await load(input.multiple ? files : files.slice(0, 1));
    } catch (error) {
      notify(error.message, true);
    }
  };
  drop.tabIndex = 0;
  drop.setAttribute("role", "button");
  drop.onclick = () => input.click();
  drop.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  };
  input.onchange = () => {
    choose([...input.files]);
    input.value = "";
  };
  drop.ondragover = (event) => {
    event.preventDefault();
    drop.classList.add("dragging");
  };
  drop.ondragleave = () => drop.classList.remove("dragging");
  drop.ondrop = (event) => {
    event.preventDefault();
    drop.classList.remove("dragging");
    choose([...event.dataTransfer.files]);
  };
  if (paste) {
    document.addEventListener("paste", (event) => {
      if (!drop.closest(".panel").classList.contains("on")) return;
      const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
        file.type.startsWith("image/"),
      );
      if (!files.length) return;
      event.preventDefault();
      choose(files);
    });
  }
}

export function validateImage(file) {
  if (
    file.type &&
    (!file.type.startsWith("image/") || file.type === "image/svg+xml")
  ) {
    throw new Error("请选择 PNG、JPG 或 WebP 等位图文件");
  }
  if (file.size > 30 * 1024 ** 2) throw new Error("图片不能超过 30 MB");
}

export function checkImageSize(width, height) {
  if (
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 24_000_000
  ) {
    throw new Error("图片过大，请先缩小尺寸或选择较小的图片");
  }
}

export async function openBitmap(file, options) {
  validateImage(file);
  const image = await createImageBitmap(file, options).catch(() => {
    throw new Error(`无法读取图片：${file.name}`);
  });
  try {
    checkImageSize(image.width, image.height);
    return image;
  } catch (error) {
    image.close();
    throw error;
  }
}

export function canvasPng(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("无法导出图片"))),
      "image/png",
    ),
  );
}

export function bindImagePreview(preview, onZoom) {
  const images = [...preview.children];
  let baseWidth = 0;
  let zoom = 1;
  let drag;
  const canPan = () =>
    preview.scrollWidth > preview.clientWidth ||
    preview.scrollHeight > preview.clientHeight;
  const resize = (next, event) => {
    const image = images.find((element) => !element.hidden);
    const before = image?.getBoundingClientRect();
    const frame = preview.getBoundingClientRect();
    const x = event?.clientX ?? frame.left + preview.clientWidth / 2;
    const y = event?.clientY ?? frame.top + preview.clientHeight / 2;
    zoom = Math.max(0.25, Math.min(4, next));
    // 只缩放显示尺寸；像素数据与下载尺寸仍由各工具控制。
    const width = `min(${baseWidth * zoom}px, ${zoom * 100}%)`;
    images.forEach((image) => {
      image.style.width = width;
    });
    onZoom?.();
    if (before?.width && before.height) {
      // 缩放后，让鼠标指向的图片位置尽量留在原处。
      const after = image.getBoundingClientRect();
      preview.scrollLeft +=
        after.left + ((x - before.left) * after.width) / before.width - x;
      preview.scrollTop +=
        after.top + ((y - before.top) * after.height) / before.height - y;
    }
    preview.classList.toggle("is-pannable", canPan());
  };
  preview.addEventListener(
    "wheel",
    (event) => {
      if (
        !images.includes(event.target) ||
        !event.deltaY ||
        event.shiftKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      event.preventDefault();
      if (event.deltaY < 0 && zoom < 4) resize(zoom * 1.25, event);
      if (event.deltaY > 0 && zoom > 0.25) resize(zoom * 0.8, event);
    },
    { passive: false },
  );
  const reset = () => {
    resize(1);
    preview.scrollLeft = preview.scrollTop = 0;
  };
  preview.ondblclick = (event) => {
    if (images.includes(event.target)) reset();
  };
  preview.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!["+", "=", "-", "0"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "0") reset();
    else resize(zoom * (event.key === "-" ? 0.8 : 1.25));
  });
  preview.ondragstart = (event) => event.preventDefault();
  preview.onpointerdown = (event) => {
    if (
      event.pointerType === "touch" ||
      event.button !== 0 ||
      !images.includes(event.target) ||
      !canPan()
    )
      return;
    event.target.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      x: event.clientX + preview.scrollLeft,
      y: event.clientY + preview.scrollTop,
    };
    preview.classList.add("is-panning");
  };
  preview.onpointermove = (event) => {
    if (drag?.id !== event.pointerId) return;
    preview.scrollLeft = drag.x - event.clientX;
    preview.scrollTop = drag.y - event.clientY;
  };
  preview.onlostpointercapture = (event) => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    preview.classList.remove("is-panning");
  };
  return (width, height) => {
    baseWidth = Math.min(width, 640, (480 * width) / height);
    images.forEach((image) => {
      image.style.aspectRatio = `${width} / ${height}`;
    });
    reset();
  };
}

export function numberField(id) {
  const input = $(`#${id}`);
  return Math.min(
    Number(input.max),
    Math.max(Number(input.min), Number(input.value || input.defaultValue)),
  );
}
