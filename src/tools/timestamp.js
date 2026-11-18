import { $, $$, act, activeIndex, copy, notify } from "../dom.js";

// 设计稿提供的是固定 UTC 偏移；UTC-5 不应用纽约夏令时规则。
export const OFFSETS = [8, 0, -5, 9];
const pad = (value) => String(value).padStart(2, "0");

export function formatDate(milliseconds, offset = 8) {
  const date = new Date(milliseconds + offset * 3600000);
  if (!Number.isFinite(date.getTime())) throw new Error("日期超出可转换范围");
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function timestampToDate(value, milliseconds = false, offset = 8) {
  if (!/^-?\d+$/.test(String(value).trim()))
    throw new Error("请输入有效的整数时间戳");
  const timestamp = Number(value) * (milliseconds ? 1 : 1000);
  if (!Number.isSafeInteger(timestamp))
    throw new Error("时间戳超出安全整数范围");
  return formatDate(timestamp, offset);
}

export function dateToTimestamp(value, offset = 8) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) throw new Error("请选择有效的日期和时间");
  const [, year, month, day, hour, minute, second = "00"] = match;
  const canonical = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const local = Date.parse(`${canonical}Z`);
  if (
    !Number.isFinite(local) ||
    new Date(local).toISOString().slice(0, 19) !== canonical
  )
    throw new Error("日期或时间无效");
  return local - offset * 3600000;
}

export function initTimestamp() {
  const panel = $("#ts");
  const nowFields = $$(".now span", panel);
  let now = Date.now();
  const tick = () => {
    now = Date.now();
    nowFields[0].textContent = formatDate(now, 8);
    nowFields[1].textContent = String(Math.floor(now / 1000));
    nowFields[2].textContent = String(now);
  };
  tick();
  setInterval(tick, 1000);
  const nowCopy = $(".now button", panel);
  nowCopy.onclick = () => act(nowCopy, () => copy(String(now)));
  nowCopy.title = "复制当前毫秒时间戳";
  const [left, right] = $$(".box", panel);
  for (const select of $$("select", panel)) {
    select.options[2].textContent = "UTC-5 固定偏移";
  }
  const leftInputs = $$("input", left);
  const rightInputs = $$("input", right);
  rightInputs[0].value = formatDate(now, 8).replace(" ", "T");
  const leftButton = $(".btn", left);
  leftButton.onclick = () =>
    act(leftButton, () => {
      leftInputs[1].value = timestampToDate(
        leftInputs[0].value,
        activeIndex($(".seg", left)) === 1,
        OFFSETS[$("select", left).selectedIndex],
      );
      notify("转换完成");
    });
  const rightButton = $(".btn", right);
  rightButton.onclick = () =>
    act(rightButton, () => {
      const timestamp = dateToTimestamp(
        rightInputs[0].value,
        OFFSETS[$("select", right).selectedIndex],
      );
      rightInputs[1].value = String(Math.floor(timestamp / 1000));
      rightInputs[2].value = String(timestamp);
      notify("转换完成");
    });
  $$(".row .mini", panel).forEach((button) => {
    button.setAttribute("aria-label", "复制转换结果");
    button.onclick = () =>
      act(button, () => copy($("input", button.parentElement).value));
  });
}
