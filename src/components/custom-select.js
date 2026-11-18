import { $$, icon } from "../dom.js";

export function initCustomSelects() {
  let opened = null;
  const controls = [];
  const close = () => {
    if (!opened) return;
    opened.menu.hidden = true;
    opened.trigger.setAttribute("aria-expanded", "false");
    opened.trigger.removeAttribute("aria-activedescendant");
    opened = null;
  };

  $$("select").forEach((select, index) => {
    const prefix = `qkit-select-${index}`;
    const label = select.closest("label");
    const labelText = label
      ? [...label.childNodes]
          .filter((node) => node.nodeType === 3)
          .map((node) => node.textContent)
          .join("")
          .trim()
      : `${select.closest(".box")?.querySelector("h4")?.textContent || "日期"}时区`;
    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-label", labelText);
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-controls", `${prefix}-menu`);
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML =
      '<span class="select-value"></span><svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>';
    const value = trigger.querySelector("span");
    const menu = document.createElement("div");
    menu.className = "select-menu";
    menu.id = `${prefix}-menu`;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", labelText);
    menu.hidden = true;
    select.before(wrapper);
    // 原始控件只保存已有业务状态，用户交互与弹层均由自定义组件提供。
    select.hidden = true;
    select.tabIndex = -1;
    wrapper.append(select, trigger);
    document.body.append(menu);
    const control = { select, trigger, menu, active: select.selectedIndex };
    controls.push(control);
    const enabled = () =>
      [...select.options]
        .map((option, i) => (option.disabled ? -1 : i))
        .filter((i) => i >= 0);
    const highlight = (active) => {
      control.active = active;
      [...menu.children].forEach((option, i) =>
        option.classList.toggle("is-active", i === active),
      );
      if (active >= 0) {
        trigger.setAttribute(
          "aria-activedescendant",
          `${prefix}-option-${active}`,
        );
        menu.children[active]?.scrollIntoView?.({ block: "nearest" });
      }
    };
    const refresh = () => {
      value.textContent = select.selectedOptions[0]?.label || "请选择";
      trigger.disabled = select.disabled;
      menu.replaceChildren(
        ...[...select.options].map((option, i) => {
          const item = document.createElement("div");
          item.className = "select-option";
          item.id = `${prefix}-option-${i}`;
          item.dataset.index = i;
          item.setAttribute("role", "option");
          item.setAttribute("aria-selected", option.selected);
          item.setAttribute("aria-disabled", option.disabled);
          const text = document.createElement("span");
          text.textContent = option.label;
          const check = document.createElement("span");
          check.className = "select-check";
          check.innerHTML = icon("ck");
          item.append(text, check);
          return item;
        }),
      );
      if (opened === control) {
        if (select.disabled) close();
        else
          highlight(
            select.options[control.active]?.disabled
              ? select.selectedIndex
              : control.active,
          );
      }
    };
    const open = () => {
      if (select.disabled) return;
      close();
      refresh();
      opened = control;
      trigger.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      // 弹层放在 body，防止面板布局裁切；靠近窗口底部时向上展开。
      const rect = trigger.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upwards = below < Math.min(menu.scrollHeight, 240) && above > below;
      const maxHeight = Math.max(40, Math.min(240, upwards ? above : below));
      menu.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
      menu.style.maxHeight = `${maxHeight}px`;
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
      menu.style.top = `${upwards ? Math.max(8, rect.top - Math.min(menu.scrollHeight, maxHeight) - 6) : rect.bottom + 6}px`;
      highlight(
        enabled().includes(select.selectedIndex)
          ? select.selectedIndex
          : (enabled()[0] ?? -1),
      );
    };
    const choose = (active) => {
      if (active < 0 || select.options[active]?.disabled) return;
      const changed = select.selectedIndex !== active;
      select.selectedIndex = active;
      close();
      if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
      refresh();
    };
    trigger.addEventListener("click", () =>
      opened === control ? close() : open(),
    );
    menu.addEventListener("pointerdown", (event) => event.preventDefault());
    menu.addEventListener("click", (event) => {
      const option = event.target.closest(".select-option");
      if (option) choose(Number(option.dataset.index));
    });
    let search = "";
    let lastKeyTime = 0;
    trigger.addEventListener("keydown", (event) => {
      const isOpen = opened === control;
      if (
        ["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        if (!isOpen) open();
        const options = enabled();
        if (isOpen && (event.key === "Enter" || event.key === " "))
          choose(control.active);
        else if (event.key === "Home") highlight(options[0] ?? -1);
        else if (event.key === "End") highlight(options.at(-1) ?? -1);
        else if (isOpen && event.key.startsWith("Arrow")) {
          const position = options.indexOf(control.active);
          highlight(
            options[
              Math.max(
                0,
                Math.min(
                  options.length - 1,
                  position + (event.key === "ArrowDown" ? 1 : -1),
                ),
              )
            ] ?? -1,
          );
        }
      } else if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        close();
      } else if (event.key === "Tab" && isOpen) {
        choose(control.active);
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (!isOpen) open();
        search =
          Date.now() - lastKeyTime > 700 ? event.key : search + event.key;
        lastKeyTime = Date.now();
        const match = enabled().find((i) =>
          select.options[i].label
            .toLowerCase()
            .startsWith(search.toLowerCase()),
        );
        if (match !== undefined) highlight(match);
      }
    });
    trigger.addEventListener("blur", () => {
      if (opened === control) close();
    });
    // 订阅选项和禁用状态更新，保持 AES/DES/GCM 的原有联动。
    new MutationObserver(refresh).observe(select, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "selected", "label", "value"],
    });
    control.refresh = refresh;
    refresh();
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("select"))
      controls.forEach((control) => control.refresh());
  });
  document.addEventListener("pointerdown", (event) => {
    if (
      opened &&
      !opened.trigger.contains(event.target) &&
      !opened.menu.contains(event.target)
    )
      close();
  });
  document.addEventListener(
    "scroll",
    (event) => {
      if (
        opened &&
        event.target !== opened.menu &&
        !opened.menu.contains(event.target)
      )
        close();
    },
    true,
  );
  window.addEventListener("resize", close);
}
