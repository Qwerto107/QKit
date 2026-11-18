import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import poetry from "../src/data/poetry.json" with { type: "json" };
import { buildPoetryPassword, filterPoetry } from "../src/tools/poetry.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const waitForPoetry = (window) => {
  const status = window.document.querySelector("#poetry-load-status");
  return new Promise((resolve, reject) => {
    const observer = new window.MutationObserver(() => {
      observer.disconnect();
      if (status.hidden) resolve();
      else reject(new Error(status.textContent));
    });
    if (status.hidden) resolve();
    else observer.observe(status, { attributes: true, childList: true });
  });
};

test("完整页面的路由、配色、密码限制、下拉及诗词联动正确", async (t) => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "http://127.0.0.1:5173/#aes",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const originals = new Map();
  const install = (key, value) => {
    if (!originals.has(key))
      originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  };
  for (const key of [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "localStorage",
    "MutationObserver",
    "Event",
    "Option",
  ]) {
    install(key, key === "window" ? window : window[key]);
  }
  install("matchMedia", () => ({ matches: false, addEventListener() {} }));
  install("addEventListener", window.addEventListener.bind(window));
  // 不启动时钟轮询；本测试只验证界面状态和交互。
  install("setInterval", () => 0);
  let requests = 0;
  install("fetch", async () => {
    requests++;
    throw new Error("离线诗词生成不应发起网络请求");
  });
  let copied;
  Object.defineProperty(window, "isSecureContext", { value: true });
  Object.defineProperty(window.navigator, "clipboard", {
    value: {
      writeText: async (value) => {
        copied = value;
      },
    },
  });
  t.after(async () => {
    await tick();
    window.close();
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    }
  });
  await import("../src/main.js");
  const $ = (selector) => window.document.querySelector(selector);
  const $$ = (selector) => [...window.document.querySelectorAll(selector)];
  const press = (element, key) =>
    element.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      }),
    );
  const selectOption = (trigger, text) => {
    trigger.click();
    const menu = window.document.getElementById(
      trigger.getAttribute("aria-controls"),
    );
    [...menu.children]
      .find((item) => item.querySelector("span").textContent === text)
      .click();
  };
  const change = (field) =>
    field.dispatchEvent(new window.Event("change", { bubbles: true }));
  const type = (field, value) => {
    field.value = value;
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  assert.equal($("html").classList.contains("booting"), false);
  assert.equal(window.location.pathname, "/crypto");
  assert.equal($("#aes").classList.contains("on"), true);
  assert.equal($("html").style.getPropertyValue("--h"), "250");
  $("#pal [data-h='305']").click();
  await tick();
  assert.equal($("html").style.getPropertyValue("--h"), "305");
  assert.equal(JSON.parse(window.localStorage.getItem("qkit.hue")), 305);
  assert.equal($$("#pal [aria-pressed=true]").length, 1);
  $("#theme").click();
  await tick();
  assert.equal($("html").dataset.theme, "dark");
  assert.equal($("html").style.getPropertyValue("--h"), "305");
  $("#pal [data-h='250']").click();
  await tick();
  assert.equal($$("[role=combobox]").length, 9);
  assert.ok(
    $$("select").every((select) => select.hidden && select.tabIndex === -1),
  );
  const [mode, padding, keyBits] = $$("#aes [role=combobox]");
  const modeSelect = $("#aes select");
  mode.click();
  press(mode, "End");
  assert.equal(modeSelect.value, "CBC");
  press(mode, "Escape");
  assert.equal(mode.getAttribute("aria-expanded"), "false");
  mode.click();
  press(mode, "End");
  press(mode, "Enter");
  await tick();
  assert.equal(modeSelect.value, "GCM");
  assert.equal(padding.textContent.trim(), "NoPadding");
  assert.equal(padding.disabled, true);
  $$("#aes .seg")[0].querySelectorAll("button")[1].click();
  await tick();
  assert.equal(modeSelect.value, "CBC");
  assert.equal(keyBits.disabled, true);
  assert.equal(keyBits.textContent.trim(), "64 位");
  mode.click();
  const modeMenu = window.document.getElementById(
    mode.getAttribute("aria-controls"),
  );
  assert.equal(modeMenu.children[3].getAttribute("aria-disabled"), "true");
  modeMenu.children[3].click();
  assert.equal(modeSelect.value, "CBC");
  press(mode, "ArrowDown");
  press(mode, "Enter");
  assert.equal(modeSelect.value, "ECB");
  assert.equal($$("#aes .fl input")[1].disabled, true);
  mode.click();
  window.document.body.dispatchEvent(
    new window.MouseEvent("pointerdown", { bubbles: true }),
  );
  assert.equal(modeMenu.hidden, true);

  const hashFormat = $("#hash [role=combobox]");
  selectOption(hashFormat, "Base64");
  assert.equal($("#hash select").selectedIndex, 2);
  const timezone = $("#ts .box [role=combobox]");
  selectOption(timezone, "UTC+9 东京");
  $("#ts .box input").value = "0";
  $("#ts .box .btn").click();
  assert.equal($("#ts .box input[readonly]").value, "1970-01-01 09:00:00");

  $("#nav-pwd").click();
  assert.equal(window.location.pathname, "/password");
  const characters = $$("#pwd .chips")[0].querySelectorAll("input");
  const options = $$("#pwd .chips")[1].querySelectorAll("input");
  const minimums = $$("#pwd .sc input");
  const digits = minimums[0];
  const digitPlus = digits.nextElementSibling;
  assert.equal(digits.max, "8");
  for (let i = 0; i < 30; i++) digitPlus.click();
  assert.equal(digits.value, "8");
  assert.equal(digitPlus.disabled, true);
  type(digits, "26");
  assert.equal(digits.value, "8");
  options[1].checked = false;
  change(options[1]);
  assert.equal(digits.max, "10");
  type($("#password-excluded"), "234");
  assert.equal(digits.max, "7");
  assert.equal(digits.value, "7");
  options[1].checked = true;
  change(options[1]);
  assert.equal(digits.max, "5");
  assert.equal(digits.value, "5");
  const passwordButtons = $$("#pwd .bar .btn");
  passwordButtons[2].click();
  await tick();
  assert.equal(
    JSON.parse(window.localStorage.getItem("qkit.password")).excluded,
    "234",
  );
  options[2].checked = false;
  change(options[2]);
  assert.ok(minimums.every((input) => input.disabled));
  assert.equal(digitPlus.disabled, true);
  passwordButtons[3].click();
  await tick();
  assert.equal($("#password-excluded").value, "");
  assert.equal(digits.value, "6");
  assert.equal(minimums[4].disabled, true);
  for (let i = 1; i < characters.length; i++) characters[i].checked = false;
  change(characters[1]);
  const length = $("#pwd input[type=range]");
  assert.equal(length.max, "8");
  assert.equal(length.value, "8");
  assert.equal(minimums[1].disabled, true);
  passwordButtons[3].click();
  await tick();
  assert.equal(length.value, "24");
  assert.equal(length.closest(".rg").querySelector(".step input").value, "24");

  assert.equal($("#poetry-controls").hasAttribute("inert"), true);
  assert.equal($$(".poetry-item").length, 0);
  $("#nav-poem").click();
  await waitForPoetry(window);
  assert.equal($("#poetry-controls").hasAttribute("inert"), false);
  assert.equal(window.location.pathname, "/poetry");
  assert.equal($("#poem").classList.contains("on"), true);
  assert.equal($("#nav-poem").getAttribute("aria-current"), "page");
  assert.equal($$("#poem select").length, 0);
  const minLength = $("#poem-min-length");
  const maxLength = $("#poem-max-length");
  assert.equal(minLength.value, "12");
  assert.equal(maxLength.value, "18");
  assert.equal(minLength.min, "6");
  assert.equal(maxLength.max, "32");
  assert.equal($("#poem-length-value").textContent, "12–18");
  assert.equal($("#poem-available"), null);
  assert.equal($("#poem-english-hint"), null);
  const assertRange = () => {
    const pool = filterPoetry({
      minLength: Number(minLength.value),
      maxLength: Number(maxLength.value),
    });
    assert.ok(
      $$(".poetry-item").every((card) =>
        pool.some((poem) => poem.id === card.dataset.id),
      ),
    );
  };
  assertRange();
  const generate = $("#generate-poetry");
  generate.click();
  await tick();
  assert.equal(requests, 0);
  assert.equal($$(".poetry-item").length, 8);
  assert.equal(generate.disabled, false);
  assert.equal($("#poetry-empty").hidden, true);
  const card = $(".poetry-item");
  const record = poetry.find(
    (item) => item.text === card.querySelector(".poetry-text").textContent,
  );
  const assertPasswordLengths = () => {
    for (const item of $$(".poetry-item")) {
      const password = item.querySelector(".poetry-password").textContent;
      assert.equal(
        item.querySelector(".poetry-password-length").textContent,
        `${[...password].length} 位`,
      );
    }
  };
  assertPasswordLengths();
  const fragments = buildPoetryPassword(record).fragments;
  const tags = [...card.querySelectorAll(".poetry-words button")];
  const wordIndex = fragments.findIndex(
    (fragment) =>
      fragment.start === record.words[0].start &&
      fragment.end === record.words[0].end,
  );
  const tag = tags[wordIndex];
  const highlighted = () =>
    [...card.querySelectorAll(".pw code b.hl")]
      .map((span) => span.textContent)
      .join("");
  tag.dispatchEvent(new window.MouseEvent("mouseenter"));
  assert.equal(
    card.querySelector(".pl mark").textContent,
    record.words[0].word,
  );
  tag.dispatchEvent(new window.MouseEvent("mouseleave"));
  assert.equal(card.querySelector(".pl mark"), null);
  tag.click();
  assert.equal(tag.getAttribute("aria-pressed"), "true");
  assert.equal(
    highlighted(),
    record.pwd.slice(record.words[0].start, record.words[0].end),
  );
  assert.equal(
    card.querySelector(".pl mark").textContent,
    record.words[0].word,
  );
  assert.equal(card.querySelector(".pl").textContent, record.text);
  assertPasswordLengths();
  card.querySelector(".pw .mini").click();
  await tick();
  assert.equal(copied, record.pwd);
  assert.equal(
    highlighted(),
    record.pwd.slice(record.words[0].start, record.words[0].end),
  );
  copied = undefined;
  card.querySelector(".poetry-password b").click();
  await tick();
  assert.equal(copied, record.pwd);
  const nextIndex = fragments.findIndex((fragment, i) => i !== wordIndex);
  tags[nextIndex].click();
  assert.equal(tag.getAttribute("aria-pressed"), "false");
  assert.equal(highlighted(), fragments[nextIndex].text);
  tags[nextIndex].click();
  assert.equal(highlighted(), "");
  assert.equal(card.querySelector(".pl mark"), null);
  const ids = () => $$(".poetry-item").map((item) => item.dataset.id);
  const originalIds = ids();
  const poemOptions = $$("#poem .poem-options input");
  assert.equal(poemOptions[2].checked, true);
  assert.equal(poemOptions[3].checked, false);
  poemOptions[0].checked = false;
  change(poemOptions[0]);
  assert.equal($(".poetry-password").textContent, record.pwd.toLowerCase());
  assert.deepEqual(ids(), originalIds);
  poemOptions[1].checked = false;
  change(poemOptions[1]);
  assert.doesNotMatch($(".poetry-password").textContent, /[^a-z0-9]/);
  assert.equal($(".poetry-password").textContent.length, record.pwd.length);
  assertPasswordLengths();
  $(".poetry-password-copy").click();
  await tick();
  assert.equal(copied, $(".poetry-password").textContent);
  for (const input of poemOptions.slice(0, 2)) {
    input.checked = true;
    change(input);
  }
  assert.equal($(".poetry-password").textContent, record.pwd);
  $(".poetry-item .pt .mini").click();
  await tick();
  assert.ok(!originalIds.includes(ids()[0]));
  assert.deepEqual(ids().slice(1), originalIds.slice(1));
  assert.equal(new Set(ids()).size, 8);
  assertPasswordLengths();
  const [, copyAll, clear] = $$("#poem .bar .btn");
  copyAll.click();
  await tick();
  assert.equal(
    copied,
    $$(".poetry-password")
      .map((item) => item.textContent)
      .join("\n"),
  );
  const poemCount = $("#poem-count");
  type(poemCount, "4");
  assert.equal($$(".poetry-item").length, 4);
  poemCount.nextElementSibling.click();
  assert.equal($$(".poetry-item").length, 5);
  clear.click();
  assert.equal($$(".poetry-item").length, 0);
  assert.equal($("#poetry-empty").hidden, false);
  assert.equal(copyAll.disabled, true);
  assert.equal(clear.disabled, true);
  generate.click();
  await tick();
  assert.equal($$(".poetry-item").length, 5);
  assert.equal(requests, 0);

  const rangeTrack = $(".poem-range");
  rangeTrack.getBoundingClientRect = () => ({ left: 0, width: 216 });
  rangeTrack.dispatchEvent(
    new window.MouseEvent("pointerdown", {
      clientX: 208,
      button: 0,
      bubbles: true,
    }),
  );
  assert.equal(maxLength.value, maxLength.max);
  rangeTrack.dispatchEvent(
    new window.MouseEvent("pointerdown", {
      clientX: 8,
      button: 0,
      bubbles: true,
    }),
  );
  assert.equal(minLength.value, minLength.min);
  assertRange();
  type(minLength, "28");
  assertRange();
  const longIds = ids();
  $(".poetry-item .pt .mini").click();
  await tick();
  assertRange();
  assert.ok(!longIds.includes(ids()[0]));
  type(minLength, minLength.min);
  type(maxLength, "25");
  type(minLength, "25");
  assertRange();
  assert.equal($$(".poetry-item").length, 1);
  assert.equal(poemCount.value, "1");
  assert.equal(poemCount.max, "1");
  assert.equal(poemCount.nextElementSibling.disabled, true);
  assert.equal($(".poetry-item .pt .mini").disabled, true);
  poemCount.focus();
  poemCount.blur();
  type(maxLength, "28");
  assert.equal(poemCount.value, "5");
  assert.equal($$(".poetry-item").length, 5);
  type(poemCount, "8");
  type(maxLength, "25");
  assert.equal(poemCount.value, "1");
  type(maxLength, "28");
  assert.equal(poemCount.value, "8");
  assert.equal($$(".poetry-item").length, 8);
  type(poemCount, "2");
  type(maxLength, "25");
  assert.equal(poemCount.value, "1");
  type(maxLength, "28");
  assert.equal(poemCount.value, "2");
  type(maxLength, "25");
  type(poemCount, "1");
  type(maxLength, "28");
  assert.equal(poemCount.value, "1");
  type(poemCount, "6");
  type(maxLength, "32");
  type(minLength, "32");
  assert.equal($$(".poetry-item").length, 0);
  assert.equal($("#poetry-empty").hidden, false);
  assert.equal(generate.disabled, true);
  assert.equal(copyAll.disabled, true);
  assert.equal(poemCount.disabled, true);
  type(maxLength, "4");
  assert.equal(maxLength.value, "32");
  type(minLength, "28");
  type(maxLength, "25");
  assert.equal(maxLength.value, "28");
  $("#poem-reset-length").click();
  assert.equal(minLength.value, "12");
  assert.equal(maxLength.value, "18");
  assert.equal($("#poem-length-value").textContent, "12–18");
  assert.equal(generate.disabled, false);
  assert.equal(poemCount.disabled, false);
  assert.equal(poemCount.value, "6");
  assert.equal($$(".poetry-item").length, 6);
  assertRange();
  assertPasswordLengths();

  type(maxLength, "25");
  type(minLength, "25");
  for (const input of poemOptions.slice(0, 3)) {
    input.checked = false;
    change(input);
  }
  assert.doesNotMatch($(".poetry-password").textContent, /[^a-z]/);
  poemOptions[3].checked = true;
  change(poemOptions[3]);
  assert.equal(poemOptions[3].closest("label").hasAttribute("title"), false);
  const english = $(".poetry-password .english-word").textContent;
  assert.match(english, /^(speak|sigh)$/);
  $(".poetry-words .english-word").click();
  assert.equal($(".poetry-text mark").textContent, english === "speak" ? "言" : "嗟叹");
  assert.equal($(".poetry-password b.hl").textContent, english);
  $(".poetry-password-copy").click();
  await tick();
  assert.equal(copied, $(".poetry-password").textContent);
  assertPasswordLengths();
  $("#poem-save-config").click();
  await tick();
  const savedConfig = JSON.parse(window.localStorage.getItem("qkit.poetry"));
  assert.deepEqual(savedConfig, {
    minLength: 25,
    maxLength: 25,
    count: 6,
    capitalize: false,
    symbols: false,
    digits: false,
    english: true,
  });
  $("#poem-reset-length").click();
  assert.equal(minLength.value, "12");
  assert.equal(maxLength.value, "18");
  assert.deepEqual(
    poemOptions.map((input) => input.checked),
    [false, false, false, true],
  );
  $("#poem-reset-config").click();
  await tick();
  assert.equal(minLength.value, "12");
  assert.equal(maxLength.value, "18");
  assert.equal(poemCount.value, "8");
  assert.equal($$(".poetry-item").length, 8);
  assert.deepEqual(
    poemOptions.map((input) => input.checked),
    [true, true, true, false],
  );
  assert.deepEqual(JSON.parse(window.localStorage.getItem("qkit.poetry")), {
    minLength: 12,
    maxLength: 18,
    count: 8,
    capitalize: true,
    symbols: true,
    digits: true,
    english: false,
  });

  $("#nav-b64").click();
  const back = new Promise((resolve) =>
    window.addEventListener("popstate", resolve, { once: true }),
  );
  window.history.back();
  await back;
  assert.equal(window.location.pathname, "/poetry");
  assert.equal($("#poem").classList.contains("on"), true);
  const forward = new Promise((resolve) =>
    window.addEventListener("popstate", resolve, { once: true }),
  );
  window.history.forward();
  await forward;
  assert.equal(window.location.pathname, "/base64");
  assert.equal($("#b64").classList.contains("on"), true);
  window.history.replaceState(null, "", "/md5");
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  assert.equal($("#md5").classList.contains("on"), true);
  assert.equal(window.document.title, "MD5 · QKit");

  for (const id of ["watermark", "blind-watermark", "animated-qr"]) {
    $(`#nav-${id}`).click();
    assert.equal(window.location.pathname, `/${id}`);
    assert.equal($(`#${id}`).classList.contains("on"), true);
  }
  $("#animated-qr [data-v='receive']").click();
  assert.equal($("#qr-mode-send").classList.contains("hide"), true);
  assert.equal($("#qr-mode-receive").classList.contains("hide"), false);

  // 用新的页面环境恢复主动保存的配置，模拟刷新，并验证暂时缩小的数量不会被保存。
  const reloaded = new JSDOM(html, {
    url: "http://127.0.0.1:5173/poetry",
    pretendToBeVisual: true,
  });
  t.after(() => reloaded.window.close());
  reloaded.window.localStorage.setItem(
    "qkit.poetry",
    JSON.stringify(savedConfig),
  );
  for (const key of [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "localStorage",
    "MutationObserver",
    "Event",
    "Option",
  ]) {
    install(key, key === "window" ? reloaded.window : reloaded.window[key]);
  }
  install(
    "addEventListener",
    reloaded.window.addEventListener.bind(reloaded.window),
  );
  await import("../src/main.js?poetry-config-reload");
  await waitForPoetry(reloaded.window);
  const restored = (selector) =>
    reloaded.window.document.querySelector(selector);
  assert.equal(restored("#poem-min-length").value, "25");
  assert.equal(restored("#poem-max-length").value, "25");
  assert.equal(restored("#poem-count").value, "1");
  assert.match(restored(".poetry-password .english-word").textContent, /^(speak|sigh)$/);
  assert.doesNotMatch(restored(".poetry-password").textContent, /[^a-z]/);
  restored("#poem-max-length").value = "28";
  restored("#poem-max-length").dispatchEvent(
    new reloaded.window.Event("input", { bubbles: true }),
  );
  assert.equal(restored("#poem-count").value, "6");
});
