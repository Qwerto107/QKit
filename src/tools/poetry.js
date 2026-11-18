import {
  $,
  $$,
  act,
  copy,
  icon,
  notify,
  readStorage,
  writeStorage,
} from "../dom.js";
import poetry from "../data/poetry.json" with { type: "json" };
import englishWords from "../data/poetry-english.json" with { type: "json" };

const DEFAULTS = {
  minLength: 12,
  maxLength: 18,
  count: 8,
  capitalize: true,
  symbols: true,
  digits: true,
  english: false,
};
const RULE_KEYS = ["capitalize", "symbols", "digits", "english"];
// 词库的 length 包含标点，滑块只统计原句中的非标点、非空白字符。
const poetryLengths = poetry.map(
  (poem) => [...poem.text.replace(/[\p{P}\s]/gu, "")].length,
);

export function normalizePoetryConfig(config) {
  const value = config && typeof config === "object" ? config : {};
  const validRange =
    Number.isInteger(value.minLength) &&
    Number.isInteger(value.maxLength) &&
    value.minLength >= 6 &&
    value.maxLength <= 32 &&
    value.minLength <= value.maxLength;
  return {
    minLength: validRange ? value.minLength : DEFAULTS.minLength,
    maxLength: validRange ? value.maxLength : DEFAULTS.maxLength,
    count:
      Number.isInteger(value.count) && value.count >= 1 && value.count <= 50
        ? value.count
        : DEFAULTS.count,
    ...Object.fromEntries(
      RULE_KEYS.map((key) => [
        key,
        typeof value[key] === "boolean" ? value[key] : DEFAULTS[key],
      ]),
    ),
  };
}

function randomIndex(size) {
  const value = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / size) * size;
  do crypto.getRandomValues(value);
  while (value[0] >= limit);
  return value[0] % size;
}

export function filterPoetry({ minLength = 12, maxLength = 18 } = {}) {
  if (
    !Number.isInteger(minLength) ||
    !Number.isInteger(maxLength) ||
    minLength < 1 ||
    maxLength < minLength
  ) {
    throw new Error("诗句字数范围须为有效整数，最短字数不能大于最长字数");
  }
  return poetry.filter(
    (_, i) => poetryLengths[i] >= minLength && poetryLengths[i] <= maxLength,
  );
}

export function generatePoetryPasswords(count = 10, range) {
  const pool = filterPoetry(range);
  if (!Number.isInteger(count) || count < 1 || count > pool.length) {
    throw new Error(
      `当前范围有 ${pool.length} 条诗句，请调整每批数量或字数范围`,
    );
  }
  for (let i = 0; i < count; i++) {
    const next = i + randomIndex(pool.length - i);
    [pool[i], pool[next]] = [pool[next], pool[i]];
  }
  return pool.slice(0, count);
}

export function buildPoetryPassword(
  poem,
  { capitalize = true, symbols = true, digits = true, english = false } = {},
) {
  const initials = [...poem.initials];
  // 默认使用词库中预先计算的密码；关闭数字或符号替换时恢复该字的拼音首字母。
  const characters = [...poem.pwd].map((character, index) => {
    const value =
      (!symbols && /[^A-Za-z0-9]/.test(character)) ||
      (!digits && /[0-9]/.test(character))
        ? initials[index]
        : character;
    return capitalize ? value : value.toLowerCase();
  });
  const piece = (start, end) => characters.slice(start, end).join("");
  const chinese = [...poem.text].filter((character) =>
    /\p{L}/u.test(character),
  );
  const fragments = [];
  let cursor = 0;
  poem.words.forEach((word) => {
    if (cursor < word.start)
      fragments.push({
        text: piece(cursor, word.start),
        clue: chinese.slice(cursor, word.start).join(""),
        start: cursor,
        end: word.start,
      });
    fragments.push({
      text: piece(word.start, word.end),
      clue: word.word,
      translation: word.label,
      start: word.start,
      end: word.end,
    });
    cursor = word.end;
  });
  if (cursor < initials.length)
    fragments.push({
      text: piece(cursor, initials.length),
      clue: chinese.slice(cursor).join(""),
      start: cursor,
      end: initials.length,
    });
  if (english) {
    const candidates = poem.words.filter(
      (word) =>
        /^[nv]/.test(word.pos) && Object.hasOwn(englishWords, word.word),
    );
    if (candidates.length) {
      const word = candidates[randomIndex(candidates.length)];
      const fragment = fragments.find(
        (part) => part.start === word.start && part.end === word.end,
      );
      const replacement = englishWords[word.word];
      // 中文区间保持不变，仅改变片段文本，因此英文长词仍能联动原词。
      fragment.text = capitalize
        ? replacement[0].toUpperCase() + replacement.slice(1)
        : replacement;
      fragment.translation = replacement;
      fragment.english = true;
    }
  }
  return {
    password: fragments.map((fragment) => fragment.text).join(""),
    fragments,
  };
}

function highlightText(container, text, start, end) {
  if (start === undefined) {
    container.textContent = text;
    return;
  }
  const characters = [...text];
  const mark = document.createElement("mark");
  mark.className = "poetry-highlight";
  mark.textContent = characters.slice(start, end).join("");
  container.replaceChildren(
    characters.slice(0, start).join(""),
    mark,
    characters.slice(end).join(""),
  );
}

function poetryCard(entry, index, replace, canReplace) {
  const { poem, generated } = entry;
  const card = document.createElement("article");
  card.className = "pc poetry-item";
  card.dataset.id = poem.id;
  card.style.setProperty("--d", Math.min(index, 5));
  // 固定结构使用模板；诗词、标签和密码均以 textContent 写入。
  card.innerHTML = `<div class="pt"><div><p class="pl poetry-text"></p><small class="ps poetry-source"></small></div><button class="mini" aria-label="换一句" title="换一句">${icon("rf")}</button></div><div class="pw"><button type="button" class="poetry-password-copy" aria-label="复制完整诗词密码" title="点击复制密码"><code class="poetry-password"></code></button><small class="poetry-password-length"></small><button class="mini" aria-label="复制诗词密码" title="复制密码">${icon("copy")}</button></div><div class="cl poetry-words" role="group" aria-label="词语与密码线索"></div>`;
  const quote = $(".pl", card);
  quote.textContent = poem.text;
  $(".ps", card).textContent = [poem.from, poem.by].filter(Boolean).join(" · ");
  const passwordLength = [...generated.password].length;
  $(".poetry-password-length", card).textContent = `${passwordLength} 位`;
  $(".poetry-password-length", card).setAttribute(
    "aria-label",
    `密码长度 ${passwordLength} 位`,
  );
  const refresh = $(".pt .mini", card);
  refresh.disabled = !canReplace;
  refresh.onclick = () => act(refresh, () => replace(index, card));
  $$(".pw button", card).forEach((button) => {
    button.onclick = () => act(button, () => copy(generated.password));
  });
  // 密码不含标点；先映射回原句位置，保证连续高亮保留原文标点。
  const positions = [...poem.text].flatMap((character, i) =>
    /\p{L}/u.test(character) ? [i] : [],
  );
  const code = $("code", card);
  const clues = $(".cl", card);
  const parts = [];
  const tags = [];
  let selected = null;
  const highlight = (active) => {
    parts.forEach((part, i) => part.classList.toggle("hl", i === active));
    tags.forEach((tag, i) => tag.classList.toggle("hl", i === active));
    const fragment = generated.fragments[active];
    highlightText(
      quote,
      poem.text,
      fragment?.start === undefined ? undefined : positions[fragment.start],
      fragment?.end === undefined ? undefined : positions[fragment.end - 1] + 1,
    );
  };
  generated.fragments.forEach((fragment, i) => {
    const part = document.createElement("b");
    part.textContent = fragment.text;
    part.classList.toggle("english-word", Boolean(fragment.english));
    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = "ch";
    tag.setAttribute("aria-pressed", "false");
    tag.setAttribute("aria-label", `${fragment.clue}，高亮中文与密码片段`);
    if (fragment.translation) tag.title = fragment.translation;
    tag.classList.toggle("english-word", Boolean(fragment.english));
    const value = document.createElement("b");
    value.textContent = fragment.text;
    const clue = document.createElement("i");
    clue.textContent = fragment.clue;
    tag.append(value, clue);
    tag.onclick = () => {
      selected = selected === i ? null : i;
      tags.forEach((item, k) =>
        item.setAttribute("aria-pressed", k === selected),
      );
      highlight(selected);
    };
    for (const target of [part, tag]) {
      target.addEventListener("mouseenter", () => highlight(i));
      target.addEventListener("mouseleave", () => highlight(selected));
    }
    tag.addEventListener("focus", () => highlight(i));
    tag.addEventListener("blur", () => highlight(selected));
    parts.push(part);
    tags.push(tag);
    code.append(part);
    clues.append(tag);
  });
  return card;
}

export function initPoetry() {
  const panel = $("#poem");
  const options = $$(".poem-options input", panel);
  const count = $("#poem-count");
  const [generate, copyAll, clear, saveConfig, resetConfig] = $$(
    ".bar .btn",
    panel,
  );
  const results = $("#pg");
  const empty = $("#poetry-empty");
  const minimum = $("#poem-min-length");
  const maximum = $("#poem-max-length");
  const rangeTrack = $(".poem-range", panel);
  const lowerBound = 6;
  const upperBound = 32;
  for (const slider of [minimum, maximum]) {
    slider.min = lowerBound;
    slider.max = upperBound;
  }
  const range = () => ({
    minLength: Number(minimum.value),
    maxLength: Number(maximum.value),
  });
  const rules = () =>
    Object.fromEntries(
      RULE_KEYS.map((key, index) => [key, options[index].checked]),
    );
  let entries = [];
  let available = [];
  // 范围收缩只限制当前显示数量，扩大后恢复用户手动设置的数量。
  let preferredCount = Number(count.value);
  let visibleCount = preferredCount;
  const makeEntry = (poem) => ({
    poem,
    generated: buildPoetryPassword(poem, rules()),
  });
  const replace = (index, card) => {
    const candidates = available.filter(
      (poem) => !entries.some((entry) => entry.poem.id === poem.id),
    );
    if (!candidates.length) throw new Error("本地词库没有更多诗句");
    entries[index] = makeEntry(candidates[randomIndex(candidates.length)]);
    card.replaceWith(
      poetryCard(entries[index], index, replace, candidates.length > 0),
    );
  };
  const render = () => {
    const canReplace = available.length > entries.length;
    results.replaceChildren(
      ...entries.map((entry, i) => poetryCard(entry, i, replace, canReplace)),
    );
    empty.hidden = entries.length > 0;
    copyAll.disabled = clear.disabled = !entries.length;
  };
  const regenerate = () => {
    available = filterPoetry(range());
    count.disabled = generate.disabled = !available.length;
    count.max = Math.max(1, Math.min(50, available.length));
    count.value = Math.min(preferredCount, Number(count.max));
    count.closest(".step").dispatchEvent(new Event("limitschange"));
    visibleCount = Number(count.value);
    entries = available.length
      ? generatePoetryPasswords(Number(count.value), range()).map(makeEntry)
      : [];
    empty.textContent = available.length
      ? "暂无结果，点击“换一批”生成。"
      : "当前字数范围没有诗句，请调整范围。";
    render();
  };
  const syncRange = () => {
    $("#poem-length-value").textContent = `${minimum.value}–${maximum.value}`;
    minimum.setAttribute("aria-valuemax", maximum.value);
    maximum.setAttribute("aria-valuemin", minimum.value);
    // 两个原生端点叠在同一条轨道上，共用刻度，选中区间单独着色。
    const extent = upperBound - lowerBound || 1;
    rangeTrack.style.setProperty(
      "--start",
      `${((Number(minimum.value) - lowerBound) / extent) * 100}%`,
    );
    rangeTrack.style.setProperty(
      "--end",
      `${((Number(maximum.value) - lowerBound) / extent) * 100}%`,
    );
  };
  for (const slider of [minimum, maximum]) {
    slider.addEventListener("input", () => {
      if (slider === minimum)
        minimum.value = Math.min(Number(minimum.value), Number(maximum.value));
      else
        maximum.value = Math.max(Number(maximum.value), Number(minimum.value));
      syncRange();
      regenerate();
    });
  }
  rangeTrack.addEventListener("pointerdown", (event) => {
    if (event.target !== rangeTrack || event.button !== 0) return;
    const bounds = rangeTrack.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left - 8) / (bounds.width - 16)),
    );
    const value = Math.round(lowerBound + fraction * (upperBound - lowerBound));
    const slider =
      Math.abs(value - Number(minimum.value)) <
      Math.abs(value - Number(maximum.value))
        ? minimum
        : maximum;
    slider.value = value;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.focus();
  });
  $("#poem-reset-length").onclick = () => {
    minimum.value = minimum.defaultValue;
    maximum.value = maximum.defaultValue;
    syncRange();
    regenerate();
  };
  generate.onclick = () => act(generate, regenerate);
  copyAll.onclick = () =>
    act(copyAll, () =>
      copy(entries.map((entry) => entry.generated.password).join("\n")),
    );
  clear.onclick = () => {
    entries = [];
    render();
  };
  const reformat = () => {
    entries = entries.map((entry) => makeEntry(entry.poem));
    render();
  };
  options.forEach((input) => input.addEventListener("change", reformat));
  count.addEventListener("change", () => {
    if (Number(count.value) !== visibleCount)
      preferredCount = Number(count.value);
    regenerate();
  });
  count.addEventListener("input", () => {
    if (count.value !== "") preferredCount = Number(count.value);
  });
  const [minus, , plus] = count.closest(".step").children;
  minus.setAttribute("aria-label", "减少诗词每批数量");
  plus.setAttribute("aria-label", "增加诗词每批数量");
  const restore = (config) => {
    const saved = normalizePoetryConfig(config);
    minimum.value = saved.minLength;
    maximum.value = saved.maxLength;
    preferredCount = saved.count;
    RULE_KEYS.forEach((key, index) => {
      options[index].checked = saved[key];
    });
    syncRange();
    regenerate();
  };
  saveConfig.onclick = () =>
    act(saveConfig, () => {
      writeStorage("qkit.poetry", {
        ...range(),
        count: preferredCount,
        ...rules(),
      });
      notify("配置已保存在当前浏览器");
    });
  resetConfig.onclick = () =>
    act(resetConfig, () => {
      restore(DEFAULTS);
      writeStorage("qkit.poetry", DEFAULTS);
      notify("已恢复默认配置");
    });
  restore(readStorage("qkit.poetry", DEFAULTS));
}
