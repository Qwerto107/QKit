import { $, act, copy, download } from "../dom.js";

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const isHostname = (hostname) =>
  hostname.length <= 253 && hostname.replace(/\.$/, "").split(".").every((label) => DNS_LABEL.test(label));

function serverName(input) {
  const value = input.trim();
  if (value === "_") return value;
  if (!value || /[\s:/\\?#@%$;{}"'\[\]]/.test(value))
    throw new Error("请输入单个域名或 IPv4 地址，例如 example.com");
  let hostname;
  try {
    hostname = new URL(`http://${value}`).hostname;
  } catch {
    throw new Error("域名或 IPv4 地址无效");
  }
  if (!isHostname(hostname)) throw new Error("域名或 IPv4 地址无效");
  return hostname;
}

function quotePath(input, label) {
  const value = input.trim();
  // Nginx 会在双引号内展开变量，路径字段只接收字面值。
  if (!value.startsWith("/") || /[\x00-\x1f\x7f"$\\]/.test(value))
    throw new Error(`${label}必须是以 / 开头的绝对路径`);
  return `"${value}"`;
}

function proxyLocation(upstream, certificate) {
  const value = upstream.trim();
  let url;
  try {
    if (!/^https?:\/\/[^/\\?#@\s%$;{}"']+\/?$/i.test(value)) throw new Error();
    url = new URL(value);
    if ((!url.hostname.startsWith("[") && !isHostname(url.hostname)) || url.port === "0")
      throw new Error();
  } catch {
    throw new Error("上游地址应为 HTTP 或 HTTPS 源地址，例如 http://127.0.0.1:3000");
  }

  // 使用不带 URI 的 proxy_pass，转发时保留原始路径和查询参数。
  const lines = [
    "    location / {",
    `        proxy_pass ${url.origin};`,
    "        proxy_http_version 1.1;",
    '        proxy_set_header Connection "";',
    "        proxy_set_header Host $proxy_host;",
    "        proxy_set_header X-Real-IP $remote_addr;",
    "        proxy_set_header X-Forwarded-Host $host;",
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "        proxy_set_header X-Forwarded-Proto $scheme;",
  ];
  if (url.protocol === "https:") {
    lines.push(
      "",
      "        proxy_ssl_server_name on;",
      "        proxy_ssl_verify on;",
      "        proxy_ssl_verify_depth 3;",
      `        proxy_ssl_trusted_certificate ${quotePath(certificate, "上游 CA 证书路径")};`,
    );
  }
  return [...lines, "    }"];
}

export function generateNginxConfig({ mode, name, port, root, upstream, certificate }) {
  const listen = port.trim();
  if (!/^\d+$/.test(listen) || Number(listen) < 1 || Number(listen) > 65535)
    throw new Error("监听端口须为 1–65535 的整数");
  const lines = ["server {", `    listen ${Number(listen)};`, `    server_name ${serverName(name)};`, ""];

  if (mode === "proxy") {
    lines.push(...proxyLocation(upstream, certificate));
  } else {
    lines.push(`    root ${quotePath(root, "站点目录")};`, "    index index.html;", "");
    if (mode === "spa") {
      // 入口文件缺失时返回 404，防止回退到同一 URI 形成重定向循环。
      lines.push("    location = /index.html {", "        try_files $uri =404;", "    }", "");
    }
    const fallback = mode === "spa" ? "/index.html" : "=404";
    lines.push("    location / {", `        try_files $uri $uri/ ${fallback};`, "    }");
  }
  return [...lines, "}", ""].join("\n");
}

export function initNginx() {
  const panel = $("#nginx");
  const form = $("form", panel);
  const mode = $("[name=mode]", panel);
  const upstream = $("[name=upstream]", panel);
  const rootField = $("[data-nginx-root]", panel);
  const upstreamField = $("[data-nginx-upstream]", panel);
  const certificateField = $("[data-nginx-ca]", panel);
  const config = $("[data-nginx-config]", panel);
  const status = $("[data-status]", panel);
  const copyButton = $("[data-nginx-copy]", panel);
  const saveButton = $("[data-nginx-download]", panel);

  const render = () => {
    const proxy = mode.value === "proxy";
    rootField.hidden = proxy;
    upstreamField.hidden = !proxy;
    certificateField.hidden = !proxy || !/^https:\/\//i.test(upstream.value.trim());
    try {
      const values = Object.fromEntries(new window.FormData(form));
      config.value = generateNginxConfig(values);
      status.textContent = "";
    } catch (error) {
      config.value = "";
      status.textContent = error.message;
    }
    copyButton.disabled = saveButton.disabled = !config.value;
  };
  panel.addEventListener("input", render);
  mode.addEventListener("change", render);
  form.addEventListener("submit", (event) => event.preventDefault());
  copyButton.onclick = () => act(copyButton, () => copy(config.value)).finally(render);
  saveButton.onclick = () => download(config.value, "site.conf");
  render();
}
