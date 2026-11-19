import { $, $$, act, copy, notify, readStorage, writeStorage } from "../dom.js";

const SYMBOLS = ["!@#$%^&*()_+<>=?|~", "!#$%&+-<>?", "!?+#$%&", "_"];
const DEFAULTS = {
  characters: [true, true, true, false, false, true, false, false],
  options: [true, true, true],
  minimums: [6, 4, 4, 1, 0],
  custom: "",
  excluded: "",
  excludeSpecified: false,
  length: 24,
  count: 12,
};

// 拒绝采样消除取模偏差，随机性仅来自浏览器的密码学随机源。
function randomIndex(size) {
  const buffer = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / size) * size;
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % size;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function characterGroups({
  characters,
  options,
  custom = "",
  excluded = "",
  excludeSpecified = true,
}) {
  const raw = [
    characters[0] ? "0123456789" : "",
    characters[1] ? "abcdefghijklmnopqrstuvwxyz" : "",
    characters[2] ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "",
    SYMBOLS.filter((_, index) => characters[index + 3]).join(""),
    characters[7] ? custom : "",
  ];
  const blocked = new Set(excludeSpecified ? excluded : "");
  const groups = raw.map((text) => [
    ...new Set(
      [...text].filter(
        (char) =>
          !blocked.has(char) && (!options[1] || !"0O1Il".includes(char)),
      ),
    ),
  ]);
  return { raw, groups };
}

// 增广匹配可重新分配已选字符，让重叠的类别各自获得独立字符。
function matchUniqueCharacter(group, assigned, visited) {
  for (const char of group) {
    if (visited.has(char)) continue;
    visited.add(char);
    const previousGroup = assigned.get(char);
    if (!previousGroup || matchUniqueCharacter(previousGroup, assigned, visited)) {
      assigned.set(char, group);
      return true;
    }
  }
  return false;
}

export function balancePasswordMinimums(config) {
  const { groups } = characterGroups(config);
  const { length, options } = config;
  const quotas = groups.map(() => 0);
  const assigned = new Map();
  const active = [...quotas.keys()].filter((index) => groups[index].length);
  let remaining = length;
  // 每轮给每类一个名额。某类容量不足时由其他类别接着分配。
  while (remaining > 0) {
    const before = remaining;
    for (const index of active) {
      if (options[0] && !matchUniqueCharacter(groups[index], assigned, new Set())) continue;
      quotas[index]++;
      if (--remaining === 0) break;
    }
    if (remaining === before) break;
  }
  return quotas;
}

export function generatePasswords(config) {
  const { characters, options, minimums, length, count, custom } = config;
  if (!Number.isInteger(length) || length < 4 || length > 64)
    throw new Error("密码长度须为 4–64 的整数");
  if (!Number.isInteger(count) || count < 1 || count > 50)
    throw new Error("生成数量须为 1–50 的整数");
  if (characters[7] && !custom) throw new Error("请填写自定义字符");
  const { raw, groups } = characterGroups(config);
  const pool = [...new Set(groups.flat())];
  if (!pool.length)
    throw new Error(
      raw.some((text) => text.length)
        ? "排除后没有可用字符，请调整字符范围或排除规则"
        : "请至少选择一种有效字符范围",
    );
  const quotas = groups.map((_, index) =>
    options[2] && raw[index].length ? minimums[index] : 0,
  );
  if (
    quotas.some((value) => !Number.isInteger(value) || value < 0 || value > 64)
  )
    throw new Error("最少字符数量须为 0–64 的整数");
  if (quotas.some((value, index) => value > 0 && !groups[index].length))
    throw new Error("排除后有字符类别不可用，无法满足最少字符数量");
  if (quotas.reduce((sum, value) => sum + value, 0) > length)
    throw new Error("各类最少字符数量之和不能超过密码长度");
  if (options[0] && length > pool.length)
    throw new Error(
      `当前仅有 ${pool.length} 个可用字符，请缩短密码或关闭“不重复字符”`,
    );
  if (options[0] && quotas.some((value, index) => value > groups[index].length))
    throw new Error("最少字符数量超过该类可用字符数");

  const output = [];
  for (let row = 0; row < count; row++) {
    const password = [];
    if (options[0]) {
      const assigned = new Map();
      groups.forEach((group, index) => {
        if (!quotas[index]) return;
        const candidates = shuffle([...group]);
        for (let i = 0; i < quotas[index]; i++) {
          if (!matchUniqueCharacter(candidates, assigned, new Set()))
            throw new Error("字符类别存在重叠，无法同时满足最少数量与不重复规则");
        }
      });
      password.push(...assigned.keys());
    } else {
      groups.forEach((group, index) => {
        for (let i = 0; i < quotas[index]; i++)
          password.push(group[randomIndex(group.length)]);
      });
    }
    const available = pool.filter(
      (char) => !options[0] || !password.includes(char),
    );
    while (password.length < length) {
      const index = randomIndex(available.length);
      password.push(available[index]);
      if (options[0]) available.splice(index, 1);
    }
    output.push(shuffle(password).join(""));
  }
  // 强度是基于字符空间的粗略估算，不把固定规则本身视为额外熵。
  const reserved = quotas.reduce((sum, value) => sum + value, 0);
  const bits =
    quotas.reduce(
      (sum, value, index) => sum + value * Math.log2(groups[index].length || 1),
      0,
    ) +
    (length - reserved) * Math.log2(pool.length);
  const strength =
    bits >= 100 ? "很高" : bits >= 75 ? "高" : bits >= 50 ? "中" : "低";
  return output.map((password) => [`强度 ${strength}`, password]);
}

function renderPasswords(container, entries) {
  container.classList.add("password-results");
  container.replaceChildren();
  for (const [strength, password] of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-item";
    button.title = `点击复制 · ${strength}`;
    const code = document.createElement("code");
    // 逐字符着色仍使用 textContent，自定义符号不会被解释为 HTML。
    for (const character of password) {
      const span = document.createElement("span");
      const type = /[0-9]/.test(character)
        ? "number"
        : /[a-z]/.test(character)
          ? "lower"
          : /[A-Z]/.test(character)
            ? "upper"
            : "symbol";
      span.className = `char-${type}`;
      span.textContent = character;
      code.append(span);
    }
    button.append(code);
    button.addEventListener("click", () => act(button, () => copy(password)));
    container.append(button);
  }
  container.hidden = !entries.length;
}

export function initPassword() {
  const panel = $("#pwd");
  const characterInputs = $$("input", $$(".chips", panel)[0]);
  const optionInputs = $$("input", $$(".chips", panel)[1]);
  const excludeToggle = optionInputs.pop();
  const minimumInputs = $$(".sc input", panel);
  const balance = $("#password-balance", panel);
  const ranges = $$("input[type=range]", panel);
  const [generate, clear] = $$(".bar .btn", panel);
  const saveButton = $("#password-save-config", panel);
  const resetButton = $("#password-reset-config", panel);
  const excluded = $("#password-excluded", panel);
  const exclusion = $("#password-exclusion", panel);
  excludeToggle.setAttribute("aria-controls", exclusion.id);
  const customLabel = document.createElement("label");
  customLabel.className = "fl custom-characters hide";
  customLabel.innerHTML =
    '自定义字符<input placeholder="输入需要加入的字符" maxlength="256" autocomplete="off">';
  $$(".chips", panel)[0].after(customLabel);
  const custom = $("input", customLabel);
  const update = () => {
    customLabel.classList.toggle("hide", !characterInputs[7].checked);
    exclusion.hidden = !excludeToggle.checked;
    const { groups } = characterGroups(read());
    const capacity = new Set(groups.flat()).size;
    ranges[0].max = optionInputs[0].checked
      ? Math.max(4, Math.min(64, capacity))
      : 64;
    ranges[0].dispatchEvent(new Event("input"));
    const length = Number(ranges[0].value);
    const minimumsEnabled = optionInputs[2].checked;
    balance.disabled = !minimumsEnabled || capacity === 0;
    minimumInputs.forEach((input, index) => {
      const enabled =
        index < 3
          ? characterInputs[index].checked
          : index === 3
            ? characterInputs.slice(3, 7).some((field) => field.checked)
            : characterInputs[7].checked;
      const maximum = groups[index].length
        ? Math.min(length, optionInputs[0].checked ? groups[index].length : 64)
        : 0;
      input.min = "0";
      input.max = String(maximum);
      if (enabled && minimumsEnabled)
        input.value = Math.min(Number(input.value) || 0, maximum);
      input.disabled = !enabled || !minimumsEnabled || maximum === 0;
      input.closest(".sc").classList.toggle("muted", input.disabled);
      input.closest(".step").dispatchEvent(new Event("limitschange"));
    });
  };
  const read = () => ({
    characters: characterInputs.map((field) => field.checked),
    options: optionInputs.map((field) => field.checked),
    minimums: minimumInputs.map((field) => Number(field.value)),
    custom: custom.value,
    excluded: excluded.value,
    excludeSpecified: excludeToggle.checked,
    length: Number(ranges[0].value),
    count: Number(ranges[1].value),
  });
  const restore = (config) => {
    characterInputs.forEach((field, index) => {
      field.checked = Boolean(
        config.characters?.[index] ?? DEFAULTS.characters[index],
      );
    });
    optionInputs.forEach((field, index) => {
      field.checked = Boolean(
        config.options?.[index] ?? DEFAULTS.options[index],
      );
    });
    minimumInputs.forEach((field, index) => {
      const value = Number(config.minimums?.[index]);
      field.value = Number.isInteger(value) && value >= 0 && value <= 64
        ? value
        : DEFAULTS.minimums[index];
    });
    custom.value =
      typeof config.custom === "string" ? config.custom.slice(0, 256) : "";
    excluded.value =
      typeof config.excluded === "string" ? config.excluded.slice(0, 256) : "";
    // 旧配置没有开关，已填写的排除字符继续生效。
    excludeToggle.checked = config.excludeSpecified ?? Boolean(excluded.value);
    ranges.forEach((range, index) => {
      const key = index ? "count" : "length";
      const value = Number(config[key]);
      range.max = index ? 50 : 64;
      range.value = Number.isInteger(value) ? value : DEFAULTS[key];
      range.dispatchEvent(new Event("input"));
    });
    update();
  };
  const save = () => writeStorage("qkit.password", read());
  const changed = () => {
    update();
    try {
      save();
    } catch {
      // 自动保存失败时继续生成，手动保存通过按钮显示错误。
    }
  };
  panel.addEventListener("change", changed);
  custom.addEventListener("input", changed);
  excluded.addEventListener("input", changed);
  balance.onclick = () => {
    const minimums = balancePasswordMinimums(read());
    minimumInputs.forEach((input, index) => {
      input.value = minimums[index];
    });
    changed();
  };
  restore(readStorage("qkit.password", DEFAULTS));
  generate.onclick = () =>
    act(generate, () =>
      renderPasswords($(".res", panel), generatePasswords(read())),
    );
  clear.onclick = () => renderPasswords($(".res", panel), []);
  saveButton.onclick = () =>
    act(saveButton, () => {
      save();
      notify("已保存配置");
    });
  resetButton.onclick = () =>
    act(resetButton, () => {
      restore(DEFAULTS);
      writeStorage("qkit.password", DEFAULTS);
      notify("已恢复默认配置");
    });
  // 首屏和手动生成使用同一套设置，包含已保存的生成数量。
  try {
    renderPasswords($(".res", panel), generatePasswords(read()));
  } catch {
    renderPasswords($(".res", panel), []);
  }
}
