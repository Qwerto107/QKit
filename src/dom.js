export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];
export const icon = (name) =>
  `<svg class="i" aria-hidden="true"><use href="#${name}"/></svg>`;

let toastTimer;
export function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
}

export async function act(button, task) {
  button.disabled = true;
  try {
    await task();
  } catch (error) {
    notify(error.message || "操作失败，请检查输入后重试", true);
  } finally {
    button.disabled = false;
  }
}

export async function copy(text) {
  if (!text) throw new Error("暂无可复制的内容");
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("复制失败，请手动选择内容复制");
  }
  notify("已复制到剪贴板");
}

export function download(content, name, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderResults(container, entries) {
  container.replaceChildren();
  for (const [label, value] of entries) {
    const row = document.createElement("div");
    row.className = "r";
    const caption = document.createElement("em");
    caption.textContent = label;
    const code = document.createElement("code");
    // 用户输入及运算结果只写入 textContent，避免被当作 HTML 执行。
    code.textContent = value;
    const button = document.createElement("button");
    button.className = "mini";
    button.setAttribute("aria-label", `复制${label}`);
    button.innerHTML = icon("copy");
    button.addEventListener("click", () => act(button, () => copy(value)));
    row.append(caption, code, button);
    container.append(row);
  }
  container.hidden = !entries.length;
}

export const activeIndex = (segment) =>
  $$("button", segment).findIndex((button) => button.classList.contains("on"));

export function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error("浏览器未允许本地存储，无法保存配置");
  }
}

export function bindFileDrop(drop, input, onFile) {
  const load = (file) => {
    if (file) act(drop, () => onFile(file));
  };
  drop.tabIndex = 0;
  drop.setAttribute("role", "button");
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => {
    load(input.files[0]);
    input.value = "";
  });
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("dragging");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("dragging");
    load(event.dataTransfer.files[0]);
  });
}
