import { $, $$, act, copy, download, icon } from "../dom.js";
import {
  AI_BOT_KEYWORDS,
  CORS_METHODS,
  DEFAULT_BOT_KEYWORDS,
  DEFAULT_COMPRESSION_TYPES,
  DEFAULT_CORS_REQUEST_HEADERS,
  SEARCH_BOT_KEYWORDS,
  generateNginxConfig,
} from "./nginx-config.js";

export { generateNginxConfig };

const NGINX_TOKEN = /(?<comment>#[^\n]*)|(?<string>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(?<directive>^[ \t]*[a-z_]\w*)|(?<variable>\$(?:\{\w+\}|\w+))/gm;
const NGINX_VARIABLE = /(?<variable>\$(?:\{\w+\}|\w+))/g;

function appendConfigTokens(container, text, pattern) {
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) container.append(text.slice(cursor, match.index));
    const kind = Object.keys(match.groups).find((name) => match.groups[name] !== undefined);
    const token = document.createElement("span");
    token.className = "nginx-token-" + kind;
    // 日志格式和响应头等引号内容中的变量也需要突出显示。
    if (kind === "string") appendConfigTokens(token, match[0], NGINX_VARIABLE);
    else token.textContent = match[0];
    container.append(token);
    cursor = match.index + match[0].length;
  }
  container.append(text.slice(cursor));
}

function bindConfigHighlight(config, highlight) {
  // 文本框负责滚动、选区和调整高度，高亮层跟随它的尺寸与位置。
  const sync = () => {
    highlight.style.width = config.clientWidth + "px";
    highlight.style.height = config.clientHeight + "px";
    highlight.scrollTop = config.scrollTop;
    highlight.scrollLeft = config.scrollLeft;
  };
  config.addEventListener("scroll", sync);
  if (typeof ResizeObserver === "function") new ResizeObserver(sync).observe(config);
  let previous = "";
  return () => {
    const text = config.value;
    if (text === previous) return;
    previous = text;
    const content = document.createDocumentFragment();
    appendConfigTokens(content, text, NGINX_TOKEN);
    highlight.replaceChildren(content);
    highlight.hidden = !text;
    sync();
  };
}

const OPTIONS = [
  { name: "https", label: "SSL / HTTPS", group: "protocol" },
  { name: "redirectHttp", label: "HTTP 跳转 HTTPS", group: "protocol", requires: "https" },
  { name: "http2", label: "HTTP/2", group: "protocol", requires: "https" },
  { name: "http3", label: "HTTP/3", group: "protocol", requires: "https" },
  { name: "hsts", label: "HSTS", group: "protocol", requires: "https" },
  { name: "hstsSubdomains", label: "HSTS 覆盖子域名", group: "protocol", requires: "hsts" },
  { name: "proxyProtocol", label: "PROXY protocol", group: "protocol", help: "TCP 监听接收负载均衡器发送的 PROXY 协议头" },
  { name: "hideRedirectPort", label: "自动跳转省略端口", group: "protocol" },
  { name: "tlsPreferServer", label: "优先使用服务端加密套件", group: "tls", requires: "https" },
  { name: "tlsSessionCache", label: "共享会话缓存（10 MiB，1 天）", group: "tls", requires: "https" },
  { name: "tlsNoTickets", label: "关闭会话票据", group: "tls", requires: "https" },
  { name: "tlsEarlyData", label: "TLS 1.3 早期数据（0-RTT）", group: "tls", requires: "https" },
  { name: "blockBots", label: "拦截常见爬虫", group: "access" },
  { name: "blockSearchBots", label: "搜索引擎爬虫", group: "bot-categories", requires: "blockBots" },
  { name: "blockAiBots", label: "AI 爬虫", group: "bot-categories", requires: "blockBots" },
  { name: "robotsTxt", label: "提供 robots.txt", group: "access" },
  { name: "limitReq", label: "按 IP 限流", group: "access" },
  { name: "cors", label: "设置 CORS", group: "access" },
  { name: "corsCredentials", label: "允许携带凭据", group: "cors", requires: "cors" },
  { name: "csp", label: "设置 CSP", group: "access" },
  { name: "gzip", label: "动态压缩", group: "gzip" },
  { name: "gzipStatic", label: "发送预压缩 .gz", group: "gzip", for: ["static", "spa"] },
  { name: "gzipVary", label: "添加 Vary: Accept-Encoding", group: "gzip-settings", checked: true },
  { name: "brotli", label: "动态压缩", group: "brotli" },
  { name: "brotliStatic", label: "发送预压缩 .br", group: "brotli", for: ["static", "spa"] },
  { name: "logs", label: "自定义日志", group: "log" },
  { name: "customLogFormat", label: "自定义访问日志格式", group: "log", requires: "logs" },
  { name: "hideVersion", label: "隐藏 Nginx 版本", group: "server" },
  { name: "limitUpload", label: "设置上传大小", group: "server" },
  { name: "cacheAssets", label: "静态资源缓存", group: "site", for: ["static", "spa"] },
  { name: "spaAssets404", label: "静态资源缺失时返回 404", group: "site", for: ["spa"] },
  { name: "websocket", label: "WebSocket", group: "site", for: ["proxy"] },
  { name: "proxyTimeout", label: "自定义上游超时", group: "site", for: ["proxy"] },
  { name: "disableBuffering", label: "关闭响应缓冲", group: "site", for: ["proxy"] },
];

function addCheckbox(group, { name, label, value = "on", checked = false, help }) {
  const chip = document.createElement("label");
  chip.className = "chip";
  if (help) chip.title = help;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = name;
  input.value = value;
  input.defaultChecked = checked;
  const box = document.createElement("span");
  box.className = "bx";
  box.setAttribute("aria-hidden", "true");
  box.innerHTML = icon("ck");
  chip.append(input, box, label);
  group.append(chip);
  return input;
}

function bindCorsOptions(form) {
  const methods = $("[data-nginx-cors-methods]", form);
  for (const method of CORS_METHODS)
    addCheckbox(methods, { name: "corsMethod", label: method, value: method, checked: true });
  const headers = $("[data-nginx-cors-headers]", form);
  for (const header of [...DEFAULT_CORS_REQUEST_HEADERS, "Accept", "X-Requested-With", "X-Request-ID"]) {
    addCheckbox(headers, {
      name: "corsHeader", label: header, value: header, checked: DEFAULT_CORS_REQUEST_HEADERS.includes(header),
    });
  }
}

function checkboxValues(data, name, customName) {
  const custom = data.get(customName).trim();
  const values = data.getAll(name);
  if (custom) values.push(custom);
  return values.join(", ");
}

export function initNginx() {
  const panel = $("#nginx");
  const form = $("form", panel);
  const mode = $("[name=mode]", form);
  const ipSource = $("[name=ipSource]", form);
  const tlsProtocols = $("[name=tlsProtocols]", form);
  const protocolSource = $('option[value="protocol"]', ipSource);
  const options = new Map(OPTIONS.map((option) => [
    option.name, addCheckbox($(`[data-nginx-options="${option.group}"]`, form), option),
  ]));
  bindCorsOptions(form);
  const botKeywords = $("[data-nginx-bot-keywords]", form);
  for (const keyword of DEFAULT_BOT_KEYWORDS)
    addCheckbox(botKeywords, { name: "botKeyword", label: keyword, value: keyword, checked: true });
  $("[data-nginx-search-bot-note]", form).textContent = `搜索引擎规则匹配 ${SEARCH_BOT_KEYWORDS.join("、")}。`;
  $("[data-nginx-ai-bot-note]", form).textContent = `AI 爬虫规则匹配 ${AI_BOT_KEYWORDS.join("、")}。`;
  for (const name of ["gzipTypes", "brotliTypes"])
    form.elements[name].defaultValue = DEFAULT_COMPRESSION_TYPES;
  const rootField = $("[data-nginx-root]", form);
  const proxyFields = $$("[data-nginx-proxy]", form);
  const locationList = $("[data-nginx-location-list]", form);
  const locationTemplate = $("[data-nginx-location-template]", form);
  const addButton = $("[data-nginx-add-location]", form);
  const trusted = $("[data-nginx-trusted]", form);
  const customIpHeader = $("[data-nginx-custom-ip-header]", form);
  const robotsMode = $("[name=robotsMode]", form);
  const robotsContent = $("[data-nginx-robots-content]", form);
  const specific = $("[data-nginx-specific]", form);
  const protocolNote = $('[data-nginx-modules="protocol"]', form);
  const ipNote = $('[data-nginx-modules="ip"]', form);
  const logEscape = $("[name=logEscape]", form);
  const logEscapeNote = $("#nginx-log-escape-note", form);
  const optionFields = $$("[data-nginx-fields]", form);
  const config = $("[data-nginx-config]", panel);
  const refreshHighlight = bindConfigHighlight(config, $(".nginx-highlight", panel));
  const status = $("[data-status]", panel);
  const copyButton = $("[data-nginx-copy]", panel);
  const saveButton = $("[data-nginx-download]", panel);
  const selected = (name) => options.get(name).checked && !options.get(name).disabled;

  const addLocation = () => {
    const row = locationTemplate.content.firstElementChild.cloneNode(true);
    const path = $("[name=locationPath]", row);
    const used = new Set($$("[name=locationPath]", locationList).map((input) => input.value.trim()));
    if (used.size) {
      path.value = "/api/";
      for (let index = 2; used.has(path.value); index++) path.value = `/api-${index}/`;
    }
    locationList.append(row);
    return path;
  };
  addLocation();

  const render = () => {
    const proxy = mode.value === "proxy";
    rootField.hidden = proxy;
    for (const field of proxyFields) field.hidden = !proxy;
    const routes = $$("[data-nginx-location]", locationList);
    for (const route of routes) {
      $("[data-nginx-ca]", route).hidden = !/^https:\/\//i.test($("[name=upstream]", route).value.trim());
      $("[data-nginx-remove-location]", route).hidden = routes.length === 1;
    }
    specific.textContent = proxy ? "反向代理" : "站点资源";
    for (const option of OPTIONS) {
      const input = options.get(option.name);
      input.parentElement.hidden = Boolean(option.for && !option.for.includes(mode.value));
      input.disabled = input.parentElement.hidden || Boolean(option.requires && !selected(option.requires));
    }
    const protocolDisabled = !selected("proxyProtocol");
    if (protocolSource.disabled !== protocolDisabled) protocolSource.disabled = protocolDisabled;
    if (protocolDisabled && ipSource.value === "protocol") {
      ipSource.value = "connection";
      ipSource.dispatchEvent(new Event("change", { bubbles: true }));
    }
    trusted.hidden = ipSource.value === "connection";
    customIpHeader.hidden = ipSource.value !== "custom";
    robotsContent.hidden = !selected("robotsTxt") || robotsMode.value !== "custom";
    for (const field of optionFields) {
      const { nginxFields, nginxTls, nginxCipher } = field.dataset;
      field.hidden = !nginxFields.split(" ").some(selected)
        || Boolean(nginxTls && !tlsProtocols.value.includes(nginxTls))
        || Boolean(nginxCipher && form.elements[nginxCipher].value !== "custom");
    }
    const modules = [
      selected("http2") && "HTTP/2 需要 Nginx 1.25.1+ 和 http_v2 模块",
      selected("http3") && "HTTP/3 需要 http_v3 模块及对应的 UDP 端口",
    ].filter(Boolean);
    protocolNote.textContent = modules.join("。");
    protocolNote.hidden = !modules.length;
    ipNote.hidden = trusted.hidden;
    const escapeNote = logEscape.selectedOptions[0]?.dataset.note ?? "";
    if (logEscapeNote.textContent !== escapeNote) logEscapeNote.textContent = escapeNote;
    try {
      const formData = new window.FormData(form);
      const values = Object.fromEntries(formData);
      values.gzipVary = formData.has("gzipVary");
      if (values.blockBots) values.botKeywords = checkboxValues(formData, "botKeyword", "botCustomKeywords");
      if (values.cors) {
        values.corsMethods = checkboxValues(formData, "corsMethod", "corsCustomMethods");
        values.corsHeaders = checkboxValues(formData, "corsHeader", "corsCustomHeaders");
      }
      if (proxy) {
        values.locations = routes.map((route) =>
          Object.fromEntries($$("input[name]", route).map(({ name, value }) => [name, value])),
        );
      }
      config.value = generateNginxConfig(values);
      status.textContent = "";
    } catch (error) {
      config.value = "";
      status.textContent = error.message;
    }
    refreshHighlight();
    copyButton.disabled = saveButton.disabled = !config.value;
  };
  form.addEventListener("input", render);
  form.addEventListener("change", render);
  form.addEventListener("submit", (event) => event.preventDefault());
  addButton.onclick = () => {
    const path = addLocation();
    render();
    path.focus();
    path.select();
  };
  locationList.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-nginx-remove-location]");
    if (!remove || locationList.children.length === 1) return;
    remove.closest("[data-nginx-location]").remove();
    render();
    addButton.focus();
  });
  copyButton.onclick = () => act(copyButton, () => copy(config.value)).finally(render);
  saveButton.onclick = () => download(config.value, "site.conf");
  render();
}
