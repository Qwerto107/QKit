import { $, $$, act, copy, icon, readStorage, writeStorage } from "./dom.js";
import { initPassword } from "./tools/password.js";
import { initCodecs } from "./tools/codecs.js";
import { initCipher } from "./tools/cipher.js";
import { initHashes } from "./tools/hashes.js";
import { initTimestamp } from "./tools/timestamp.js";
import { initWatermark } from "./tools/watermark.js";
import { initBlindWatermark } from "./tools/blind-watermark.js";
import { initAnimatedQr } from "./tools/animated-qr.js";
import { initCustomSelects } from "./components/custom-select.js";

const TOOLS = [
  [
    "生成",
    [
      ["pwd", "key", "随机密码", "/password"],
      ["poem", "book", "诗词密码", "/poetry"],
    ],
  ],
  [
    "编解码",
    [
      ["b64", "img", "Base64", "/base64"],
      ["url", "link", "URL", "/url"],
    ],
  ],
  [
    "加密与哈希",
    [
      ["aes", "lock", "AES / DES", "/crypto"],
      ["hash", "hash-icon", "哈希散列", "/hash"],
      ["md5", "shield", "MD5", "/md5"],
    ],
  ],
  [
    "图片与文件",
    [
      ["watermark", "img", "图片加水印", "/watermark"],
      ["blind-watermark", "img", "盲水印查看", "/blind-watermark"],
      ["animated-qr", "qr", "动态二维码传输", "/animated-qr"],
    ],
  ],
  ["时间", [["ts", "clock", "时间戳", "/timestamp"]]],
];
const modules = TOOLS.flatMap(([, tools]) => tools);

const toast = document.createElement("div");
toast.id = "toast";
toast.setAttribute("role", "status");
toast.setAttribute("aria-live", "polite");
document.body.append(toast);

// 复用设计稿的数据声明生成控件，所有工具共享相同的视觉结构。
$$("[data-c]").forEach((container) => {
  container.innerHTML = container.dataset.c
    .split(",")
    .map((text) => {
      const checked = text.endsWith("*");
      return `<label class="chip"><input type="checkbox" ${checked ? "checked" : ""}><span class="bx">${icon("ck")}</span>${checked ? text.slice(0, -1) : text}</label>`;
    })
    .join("");
});
$$("[data-s]").forEach((container) => {
  container.innerHTML = container.dataset.s
    .split(",")
    .map((item) => {
      const [label, value] = item.split(":");
      return `<div class="sc"><span>${label}</span><div class="step"><button aria-label="减少${label}数量">${icon("minus")}</button><input value="${value}" aria-label="${label}最少数量" inputmode="numeric"><button aria-label="增加${label}数量">${icon("plus")}</button></div></div>`;
    })
    .join("");
});
$$("[data-io]").forEach((container) => {
  const [inputLabel, outputLabel, placeholder] =
    container.dataset.io.split("|");
  container.innerHTML = `<div class="f"><div class="fh"><span>${inputLabel}</span><button class="mini" aria-label="清空输入">${icon("trash")}</button></div><textarea placeholder="${placeholder}" aria-label="${inputLabel}" spellcheck="false"></textarea></div><button class="sw" aria-label="交换输入与输出">${icon("swap")}</button><div class="f"><div class="fh"><span>${outputLabel}</span><button class="mini" aria-label="复制结果">${icon("copy")}</button></div><textarea readonly placeholder="结果将显示在这里" aria-label="${outputLabel}"></textarea></div>`;
  const [source, target] = $$("textarea", container);
  const [clearButton, copyButton] = $$(".mini", container);
  clearButton.onclick = () => {
    source.value = "";
    source.focus();
  };
  copyButton.onclick = () => act(copyButton, () => copy(target.value));
  $(".sw", container).onclick = () => {
    [source.value, target.value] = [target.value, source.value];
    source.focus();
  };
});

function fillRange(range) {
  const extent = Number(range.max) - Number(range.min);
  range.style.setProperty(
    "--p",
    `${extent ? ((range.value - range.min) / extent) * 100 : 100}%`,
  );
}
$$(".step").forEach((step) => {
  const [minus, input, plus] = step.children;
  const range = $("input[type=range]", step.closest(".rg") || step);
  const label = step.closest(".rg")?.querySelector("b")?.textContent;
  if (label) {
    input.setAttribute("aria-label", label);
    input.inputMode = "numeric";
    minus.setAttribute("aria-label", `减少${label}`);
    plus.setAttribute("aria-label", `增加${label}`);
    range.setAttribute("aria-label", `${label}滑块`);
  }
  const refresh = () => {
    const minimum = Number(range?.min || input.min || 0);
    const maximum = Number(range?.max || input.max || 64);
    minus.disabled = input.disabled || Number(input.value) <= minimum;
    plus.disabled = input.disabled || Number(input.value) >= maximum;
  };
  const set = (value, emit = true) => {
    if (input.disabled) {
      refresh();
      return;
    }
    const number = Number.isFinite(value) ? Math.round(value) : 0;
    input.value = Math.max(
      Number(range?.min || input.min || 0),
      Math.min(Number(range?.max || input.max || 64), number),
    );
    if (range) {
      range.value = input.value;
      fillRange(range);
    }
    refresh();
    if (emit) input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  minus.onclick = () => set(Number(input.value) - 1);
  plus.onclick = () => set(Number(input.value) + 1);
  if (step.closest("#pwd")) {
    const adjustWithWheel = (event) => {
      if (
        input.disabled ||
        !event.deltaY ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      set(Number(input.value) - Math.sign(event.deltaY));
    };
    step.addEventListener("wheel", adjustWithWheel, { passive: false });
    range?.addEventListener("wheel", adjustWithWheel, { passive: false });
  }
  input.addEventListener("input", () => {
    if (input.value !== "") set(Number(input.value));
  });
  step.addEventListener("limitschange", () => set(Number(input.value), false));
  refresh();
  input.addEventListener("blur", () => set(Number(input.value)));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      set(Number(input.value));
      input.blur();
    }
  });
});
$$(".rg input[type=range]").forEach((range) => {
  fillRange(range);
  range.addEventListener("input", () => {
    fillRange(range);
    $(".step input", range.closest(".rg")).value = range.value;
    $(".step", range.closest(".rg")).dispatchEvent(new Event("limitschange"));
  });
});

$$(".seg").forEach((segment) => {
  segment.setAttribute("role", "group");
  const sync = () =>
    $$("button", segment).forEach((button) =>
      button.setAttribute("aria-pressed", button.classList.contains("on")),
    );
  sync();
  segment.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    $$("button", segment).forEach((item) =>
      item.classList.toggle("on", item === button),
    );
    if (segment.dataset.show) {
      const prefix = segment.dataset.show;
      $$(`[id^="${prefix}-"]`).forEach((item) =>
        item.classList.toggle(
          "hide",
          item.id !== `${prefix}-${button.dataset.v}`,
        ),
      );
    }
    sync();
  });
});

$("#nav").setAttribute("aria-label", "工具导航");
$("#nav").innerHTML = TOOLS.map(
  ([group, tools]) =>
    `<div class="grp"><small>${group}</small><div>${tools.map(([id, name, label, path]) => `<a class="tb${id === "pwd" ? " on" : ""}" href="${path}" id="nav-${id}" data-t="${id}" aria-controls="${id}" ${id === "pwd" ? 'aria-current="page"' : ""}>${icon(name)}${label}</a>`).join("")}</div></div>`,
).join("");
$$(".panel").forEach((panel) =>
  panel.setAttribute("aria-labelledby", `nav-${panel.id}`),
);
let poetryLoad;
function loadPoetry() {
  // 首次进入时才下载词库；重复切换路由不重复初始化或覆盖结果。
  poetryLoad ??= import("./tools/poetry.js")
    .then(({ initPoetry }) => {
      initPoetry();
      $("#poetry-controls").removeAttribute("inert");
      $("#poetry-load-status").hidden = true;
    })
    .catch(() => {
      $("#poetry-load-status").textContent = "诗词加载失败，请刷新页面重试。";
    });
}

function showTool(id, revealNav = true) {
  if (!$(`#${id}.panel`)) return;
  $$(".tb").forEach((button) => {
    const active = button.dataset.t === id;
    button.classList.toggle("on", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $$(".panel").forEach((panel) => {
    const wasActive = panel.classList.contains("on");
    const active = panel.id === id;
    panel.classList.toggle("on", active);
    if (wasActive && !active) panel.dispatchEvent(new Event("toolhide"));
  });
  document.title = `${modules.find((item) => item[0] === id)[2]} · QKit`;
  if (id === "poem") loadPoetry();
  if (revealNav && matchMedia("(max-width:820px)").matches) {
    $(`#nav-${id}`).scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
  }
}
function navigate(id, replace = false) {
  const target = modules.find((item) => item[0] === id);
  if (!target) return;
  if (location.pathname !== target[3] || location.hash) {
    history[replace ? "replaceState" : "pushState"](null, "", target[3]);
  }
  showTool(id);
}
$("#nav").addEventListener("click", (event) => {
  const button = event.target.closest(".tb");
  if (
    button &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.button
  ) {
    event.preventDefault();
    navigate(button.dataset.t);
  }
});
const query = $("#q");
query.setAttribute("aria-label", "搜索工具");
const empty = document.createElement("p");
empty.className = "search-empty hide";
empty.textContent = "未找到匹配的工具";
empty.setAttribute("role", "status");
$("#nav").after(empty);
query.addEventListener("input", () => {
  const value = query.value.trim().toLowerCase();
  $$(".tb").forEach((button) =>
    button.classList.toggle(
      "hide",
      Boolean(value) && !button.textContent.toLowerCase().includes(value),
    ),
  );
  $$(".grp").forEach((group) =>
    group.classList.toggle("hide", !$(".tb:not(.hide)", group)),
  );
  empty.classList.toggle("hide", Boolean($(".tb:not(.hide)")));
});
query.addEventListener("keydown", (event) => {
  if (event.key === "Enter") $(".tb:not(.hide)")?.click();
  if (event.key === "Escape") {
    query.value = "";
    query.dispatchEvent(new Event("input"));
  }
});

const palette = $("#pal");
const paletteButtons = $$("button", palette);
const applyHue = (value) => {
  const hue = paletteButtons.some(
    (button) => button.dataset.h === String(value),
  )
    ? String(value)
    : "250";
  document.documentElement.style.setProperty("--h", hue);
  paletteButtons.forEach((button) => {
    const active = button.dataset.h === hue;
    button.classList.toggle("on", active);
    button.setAttribute("aria-pressed", active);
  });
};
applyHue(readStorage("qkit.hue", 250));
palette.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  act(button, () => {
    applyHue(button.dataset.h);
    writeStorage("qkit.hue", Number(button.dataset.h));
  });
});

const theme = readStorage("qkit.theme", null);
if (theme === "light" || theme === "dark")
  document.documentElement.dataset.theme = theme;
const themeButton = $("#theme");
const syncTheme = () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme:dark)").matches;
  themeButton.classList.toggle("is-dark", dark);
  themeButton.title = dark ? "切换到浅色主题" : "切换到深色主题";
};
syncTheme();
matchMedia("(prefers-color-scheme:dark)").addEventListener("change", syncTheme);
themeButton.onclick = () =>
  act(themeButton, () => {
    const next = themeButton.classList.contains("is-dark") ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    syncTheme();
    writeStorage("qkit.theme", next);
  });

// 初始示例摘要也提供复制；动态结果由 renderResults 绑定。
$$(".res .mini").forEach((button) => {
  button.setAttribute("aria-label", "复制结果");
  button.onclick = () =>
    act(button, () => copy($("code", button.parentElement).textContent));
});
$$("textarea").forEach((field) => {
  field.spellcheck = false;
  if (!field.hasAttribute("aria-label"))
    field.setAttribute("aria-label", field.placeholder || "输入内容");
});

initPassword();
initCodecs();
initCipher();
initHashes();
initTimestamp();
initWatermark();
initBlindWatermark();
initAnimatedQr();
initCustomSelects();
// History 路由支持独立模块地址；兼容此前分享的 #pwd 等旧链接。
const resolveRoute = () =>
  modules.find((item) => item[3] === location.pathname.replace(/\/$/, "")) ||
  modules.find((item) => item[0] === location.hash.slice(1)) ||
  modules[0];
const initialRoute = resolveRoute();
history.replaceState(null, "", initialRoute[3]);
showTool(initialRoute[0], false);
document.documentElement.classList.remove("booting");
addEventListener("popstate", () => showTool(resolveRoute()[0], false));
addEventListener("hashchange", () => {
  const legacy = modules.find((item) => item[0] === location.hash.slice(1));
  if (legacy) navigate(legacy[0], true);
});
