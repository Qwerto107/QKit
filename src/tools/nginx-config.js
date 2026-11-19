const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const isHostname = (name) =>
  name.length <= 253 && name.replace(/\.$/, "").split(".").every((label) => DNS_LABEL.test(label));
export const DEFAULT_COMPRESSION_TYPES = "text/plain text/css text/javascript application/javascript application/json application/xml application/wasm image/svg+xml";
export const DEFAULT_BOT_KEYWORDS = ["bot", "crawler", "spider", "slurp"];
export const SEARCH_BOT_KEYWORDS = ["Googlebot", "bingbot", "DuckDuckBot"];
export const AI_BOT_KEYWORDS = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot"];
const ROBOTS_POLICIES = { allow: "User-agent: *\nDisallow:", deny: "User-agent: *\nDisallow: /" };
const ASSETS = "(?:^/assets/|\\.(?:css|js|mjs|map|json|xml|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|wasm|webmanifest)$)";
const IP_HEADERS = {
  forwarded: "X-Forwarded-For",
  real: "X-Real-IP",
  protocol: "proxy_protocol",
};
const TLS12_AES = "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";
const TLS12_CHACHA = "ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305";
const TLS12_CIPHERS = { aes: TLS12_AES, chacha: TLS12_CHACHA, both: `${TLS12_AES}:${TLS12_CHACHA}` };
const TLS13_CIPHERS = {
  aes: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384",
  chacha: "TLS_CHACHA20_POLY1305_SHA256",
  both: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256",
};
const CORS_HEADERS = ["Origin", "Methods", "Headers", "Credentials"];
export const CORS_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
export const DEFAULT_CORS_REQUEST_HEADERS = ["Content-Type", "Authorization"];

function serverName(input) {
  const value = input.trim();
  if (value === "_") return value;
  if (!value || /[\s:/\\?#@%$;{}"'\[\]]/.test(value))
    throw new Error("请输入有效的域名或 IPv4 地址，例如 example.com");
  let hostname;
  try {
    hostname = new URL(`http://${value}`).hostname;
  } catch {
    throw new Error("域名或 IPv4 地址无效");
  }
  if (!isHostname(hostname)) throw new Error("域名或 IPv4 地址无效");
  return hostname;
}

function integer(input, label, max, min = 1) {
  const value = String(input ?? "").trim();
  const number = Number(value);
  if (!/^\d+$/.test(value) || number < min || number > max)
    throw new Error(`${label}须为 ${min}–${max} 的整数`);
  return number;
}

function quotePath(input = "", label) {
  const value = input.trim();
  // Nginx 会在引号内展开变量，路径字段只接收字面值。
  if (!value.startsWith("/") || /[\x00-\x1f\x7f"$\\]/.test(value))
    throw new Error(`${label}必须是以 / 开头的绝对路径`);
  return `"${value}"`;
}

function uriPath(input, label) {
  const value = input.trim();
  if (!/^\/[\p{L}\p{N}/_.~-]*$/u.test(value))
    throw new Error(`${label}应为以 / 开头的路径，例如 /api/`);
  return value;
}

function upstreamOrigin(input, label = "上游地址") {
  const value = input.trim();
  try {
    if (!/^https?:\/\/[^/\\?#@\s%$;{}"']+\/?$/i.test(value)) throw new Error();
    const url = new URL(value);
    if ((!url.hostname.startsWith("[") && !isHostname(url.hostname)) || url.port === "0")
      throw new Error();
    return url;
  } catch {
    throw new Error(`${label}应为 HTTP 或 HTTPS 源地址，例如 https://example.com`);
  }
}

function isNetwork(value) {
  const [address, prefix, extra] = value.split("/");
  if (extra !== undefined || (prefix !== undefined && !/^\d{1,3}$/.test(prefix))) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address))
    return address.split(".").every((part) => Number(part) <= 255) && Number(prefix ?? 32) <= 32;
  if (!/^[\da-f.:]+$/i.test(address) || Number(prefix ?? 128) > 128) return false;
  try {
    return new URL(`http://[${address}]`).hostname.startsWith("[");
  } catch {
    return false;
  }
}

function realIpDirectives({ ipSource = "connection", ipHeader = "", trustedNetworks = "", proxyProtocol }) {
  if (ipSource === "connection") return [];
  if (ipSource !== "custom" && !Object.hasOwn(IP_HEADERS, ipSource)) throw new Error("访客 IP 来源无效");
  if (ipSource === "protocol" && !proxyProtocol)
    throw new Error("使用 PROXY protocol 识别访客 IP 时，请开启 PROXY protocol 监听");
  const header = ipSource === "custom" ? ipHeader.trim() : IP_HEADERS[ipSource];
  if (ipSource === "custom" && !/^[a-z0-9][a-z0-9-]*$/i.test(header))
    throw new Error("请填写有效的访客 IP 请求头，例如 CF-Connecting-IP");
  const networks = [...new Set(trustedNetworks.trim().split(/[\s,，]+/).filter(Boolean))];
  if (!networks.length || networks.some((network) => !isNetwork(network)))
    throw new Error("请填写可信代理的 IP 或 CIDR 网段，例如 192.0.2.10、10.20.0.0/16");
  return [
    "    # 仅信任下列代理提供的访客 IP。",
    ...networks.map((network) => `    set_real_ip_from ${network};`),
    `    real_ip_header ${header};`,
    ...(header.toLowerCase() === "x-forwarded-for" ? ["    real_ip_recursive on;"] : []),
  ];
}

function logDirectives(settings) {
  const http = [];
  const server = [];
  if (!settings.logs) return { http, server };
  const level = settings.errorLevel ?? "warn";
  if (!["debug", "info", "notice", "warn", "error", "crit", "alert", "emerg"].includes(level))
    throw new Error("请选择有效的错误日志级别");
  let format = "";
  if (settings.customLogFormat) {
    const name = settings.logFormatName?.trim() ?? "";
    const escape = settings.logEscape ?? "default";
    const pattern = settings.logPattern?.replace(/[ \t]*(?:\r\n?|\n)[ \t]*/g, " ").trim() ?? "";
    if (!/^[a-z0-9_-]+$/i.test(name) || name.toLowerCase() === "combined")
      throw new Error("日志格式名称只能包含字母、数字、下划线和连字符，且不能使用 combined");
    if (!["default", "json", "none"].includes(escape))
      throw new Error("请选择有效的访问日志转义方式");
    if (!pattern || /[\x00-\x08\x0b-\x1f\x7f]/.test(pattern))
      throw new Error("请输入有效的访问日志格式");
    // 保留 Nginx 日志变量，将整个格式写为单个配置参数。
    const quoted = pattern.replace(/[\\']/g, "\\$&");
    http.push(
      "# 自定义访问日志格式定义在 http 块，供下方站点引用。",
      `log_format ${name} escape=${escape} '${quoted}';`,
      "",
    );
    format = ` ${name}`;
  }
  server.push(
    "    # 将访问与错误分别写入指定的日志文件。",
    `    access_log ${quotePath(settings.accessLog, "访问日志路径")}${format};`,
    `    error_log ${quotePath(settings.errorLog, "错误日志路径")} ${level};`,
  );
  return { http, server };
}

function compressionTypes(input = DEFAULT_COMPRESSION_TYPES, label) {
  const types = [...new Set(input.toLowerCase().split(/[\s,，]+/).filter(Boolean))];
  if (types.some((type) => type !== "*" && !/^[a-z0-9][a-z0-9.+_-]*\/[a-z0-9][a-z0-9.+_-]*$/.test(type)))
    throw new Error(`${label} MIME 类型无效，请填写如 text/css 的完整类型`);
  return types.includes("*") ? "*" : types.filter((type) => type !== "text/html").join(" ");
}

function compressionDirectives(settings) {
  const lines = [];
  const gzipStatic = settings.gzipStatic && settings.mode !== "proxy";
  const brotliStatic = settings.brotliStatic && settings.mode !== "proxy";
  if (settings.gzip) {
    const level = integer(settings.gzipLevel ?? 1, "Gzip 压缩级别", 9);
    const minLength = integer(settings.gzipMinLength ?? 1024, "Gzip 最小响应大小", 2147483647, 0);
    const types = compressionTypes(settings.gzipTypes, "Gzip");
    lines.push(
      "    # 对符合类型和大小条件的响应启用 Gzip 压缩。",
      "    gzip on;",
      `    gzip_comp_level ${level};`,
      `    gzip_min_length ${minLength};`,
      ...(types ? [`    gzip_types ${types};`] : []),
    );
  }
  if (gzipStatic) lines.push("    # 为支持 Gzip 的客户端发送同名 .gz 文件。", "    gzip_static on;");
  if (settings.gzip || gzipStatic) {
    lines.push(`    gzip_vary ${settings.gzipVary === false ? "off" : "on"};`);
    const rules = { off: "off", any: "any", uncached: "expired no-cache no-store private" };
    const mode = settings.gzipProxied ?? "default";
    if (mode !== "default") {
      if (!Object.hasOwn(rules, mode)) throw new Error("请选择有效的 Gzip 代理请求压缩方式");
      lines.push("    # 设置携带 Via 请求头的请求是否可使用 Gzip。", `    gzip_proxied ${rules[mode]};`);
    }
  }
  if (settings.brotli) {
    const level = integer(settings.brotliLevel ?? 6, "Brotli 压缩级别", 11, 0);
    const minLength = integer(settings.brotliMinLength ?? 20, "Brotli 最小响应大小", 2147483647, 0);
    const types = compressionTypes(settings.brotliTypes, "Brotli");
    lines.push(
      "    # Brotli 动态压缩需要 ngx_brotli 过滤模块。",
      "    brotli on;",
      `    brotli_comp_level ${level};`,
      `    brotli_min_length ${minLength};`,
      ...(types ? [`    brotli_types ${types};`] : []),
    );
  }
  if (brotliStatic) lines.push("    # 为支持 Brotli 的客户端发送同名 .br 文件。", "    brotli_static on;");
  return lines;
}

function botDirectives(settings) {
  if (!settings.blockBots) return [];
  const words = [
    ...(settings.botKeywords ?? DEFAULT_BOT_KEYWORDS.join(",")).split(/[,，]/),
    ...(settings.blockSearchBots ? SEARCH_BOT_KEYWORDS : []),
    ...(settings.blockAiBots ? AI_BOT_KEYWORDS : []),
  ];
  const tokens = [...new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean))];
  if (!tokens.length) throw new Error("请勾选或填写至少一个爬虫关键词");
  if (tokens.some((word) => !/^[a-z0-9._ /-]+$/i.test(word)))
    throw new Error("爬虫关键词可使用字母、数字、空格、点、斜杠、下划线和连字符");
  // 关键词按字面匹配，点号只表示字符本身。
  const pattern = tokens.map((word) => word.replaceAll(".", "[.]")).join("|");
  const agent = settings.robotsTxt ? "$qkit_bot_agent" : "$http_user_agent";
  return [
    ...(settings.robotsTxt ? [
      "    # 允许爬虫读取本站发布的 robots.txt。",
      "    set $qkit_bot_agent $http_user_agent;",
      "    if ($uri = /robots.txt) {",
      '        set $qkit_bot_agent "";',
      "    }",
    ] : []),
    "    # User-Agent 命中任一爬虫关键词时返回 403。",
    `    if (${agent} ~* "(${pattern})") {`,
    "        return 403;",
    "    }",
  ];
}

function robotsLocation(settings) {
  if (!settings.robotsTxt) return [];
  const mode = settings.robotsMode ?? "allow";
  if (mode !== "custom" && !Object.hasOwn(ROBOTS_POLICIES, mode))
    throw new Error("请选择有效的 robots.txt 规则");
  const content = (mode === "custom" ? settings.robotsContent ?? "" : ROBOTS_POLICIES[mode])
    .replace(/\r\n?/g, "\n").trim();
  if (!content || /[\x00-\x08\x0b-\x1f\x7f$]/.test(content.replaceAll("\n", "")))
    throw new Error("请填写有效的 robots.txt 内容，文本中不能包含 $ 或控制字符");
  // 把多行文本写成单个 Nginx 字符串参数。
  const value = content.replace(/[\\"]/g, "\\$&").replaceAll("\n", "\\n");
  return [
    "    # 发布爬虫抓取规则。",
    "    location = /robots.txt {",
    "        default_type text/plain;",
    "        charset utf-8;",
    `        return 200 "${value}\\n";`,
    "    }", "",
  ];
}

function accessDirectives(settings, zone) {
  const http = [];
  const server = [];
  if (settings.limitReq) {
    const rate = integer(settings.requestRate ?? "10", "每秒请求数", 1000000);
    const burst = integer(settings.requestBurst ?? "20", "突发请求数", 1000000, 0);
    http.push("# 在 http 块中为此站点定义按访客 IP 计数的限流区。", `limit_req_zone $binary_remote_addr zone=${zone}:10m rate=${rate}r/s;`, "");
    server.push("    # 超出限流额度时返回 429。", `    limit_req zone=${zone}${burst ? ` burst=${burst} nodelay` : ""};`, "    limit_req_status 429;");
  }
  if (settings.cors) {
    const input = (settings.corsOrigin ?? "https://app.example.com").trim();
    const corsOrigin = input === "*" ? input : upstreamOrigin(input, "CORS 来源").origin;
    if (corsOrigin === "*" && settings.corsCredentials)
      throw new Error("允许 CORS 凭据时，请填写具体来源");
    // 方法和请求头名称写入固定响应头，不接收变量或多行指令。
    const methods = (settings.corsMethods ?? CORS_METHODS.join(", ")).trim();
    const headers = (settings.corsHeaders ?? DEFAULT_CORS_REQUEST_HEADERS.join(", ")).trim();
    const tokenList = /^[a-z0-9_-]+(?:[ \t]*,[ \t]*[a-z0-9_-]+)*$/i;
    if (!methods) throw new Error("请至少选择一种 CORS 请求方法");
    if (!tokenList.test(methods) || (headers && !tokenList.test(headers)))
      throw new Error("CORS 方法和请求头请使用逗号分隔的名称");
    http.push(
      "# 识别带有 Origin 和 Access-Control-Request-Method 的 OPTIONS 预检。",
      'map "$request_method $http_origin $http_access_control_request_method" $qkit_cors_preflight {',
      "    default 0;",
      '    "~^OPTIONS [^ ]+ [^ ]+$" 1;',
      "}", "",
    );
    server.push(
      "    # 添加 CORS 响应头，并直接回复浏览器预检。",
      `    add_header Access-Control-Allow-Origin "${corsOrigin}" always;`,
      `    add_header Access-Control-Allow-Methods "${methods}" always;`,
      ...(headers ? [`    add_header Access-Control-Allow-Headers "${headers}" always;`] : []),
      ...(settings.corsCredentials ? ["    add_header Access-Control-Allow-Credentials true always;"] : []),
      "    if ($qkit_cors_preflight) {",
      "        return 204;",
      "    }",
    );
  }
  if (settings.csp) {
    const policy = (settings.cspPolicy ?? "default-src 'self'; object-src 'none'; base-uri 'self'").replace(/[\r\n]+/g, " ").trim();
    if (!policy || /[\x00-\x1f\x7f"\\$]/.test(policy))
      throw new Error("请输入有效的 CSP 策略，文本中不能包含双引号、反斜杠或变量");
    server.push("    # 由浏览器执行内容安全策略。", `    add_header Content-Security-Policy "${policy}" always;`);
  }
  return { http, server };
}

function cipherList(profile = "default", custom, presets, pattern, label) {
  if (profile === "default") return "";
  if (Object.hasOwn(presets, profile)) return presets[profile];
  const value = custom?.trim() ?? "";
  if (profile === "custom" && pattern.test(value)) return value;
  throw new Error(`请输入有效的${label}加密套件`);
}

function tlsDirectives(settings, port) {
  const protocols = settings.tlsProtocols ?? "TLSv1.2 TLSv1.3";
  if (!["TLSv1.2 TLSv1.3", "TLSv1.2", "TLSv1.3"].includes(protocols))
    throw new Error("请选择有效的 TLS 协议");
  if (settings.http3 && !protocols.includes("TLSv1.3"))
    throw new Error("开启 HTTP/3 需要启用 TLS 1.3");
  if (settings.tlsEarlyData && !protocols.includes("TLSv1.3"))
    throw new Error("开启 TLS 0-RTT 需要启用 TLS 1.3");

  const lines = [
    "    # HTTPS 使用部署环境中的证书链和私钥文件。",
    `    ssl_certificate ${quotePath(settings.tlsCert, "SSL 证书路径")};`,
    `    ssl_certificate_key ${quotePath(settings.tlsKey, "SSL 私钥路径")};`,
    `    ssl_protocols ${protocols};`,
  ];
  if (settings.tlsCurves) {
    if (!/^[a-z0-9_-]+(?::[a-z0-9_-]+)*$/i.test(settings.tlsCurves))
      throw new Error("TLS 曲线应使用冒号分隔的名称");
    lines.push("    # 设置 TLS 握手可用的密钥交换群组。", `    ssl_ecdh_curve ${settings.tlsCurves};`);
  }
  if (protocols.includes("TLSv1.2")) {
    const ciphers = cipherList(
      settings.tls12CipherProfile, settings.tls12Ciphers, TLS12_CIPHERS, /^[a-z0-9_!@=+:, \t-]+$/i, " TLS 1.2 ",
    );
    if (ciphers) lines.push("    # 设置 TLS 1.2 的加密与认证套件。", `    ssl_ciphers '${ciphers}';`);
  }
  if (protocols.includes("TLSv1.3")) {
    const suites = cipherList(
      settings.tls13CipherProfile, settings.tls13Ciphers, TLS13_CIPHERS, /^TLS_[A-Z0-9_]+(?::TLS_[A-Z0-9_]+)*$/, " TLS 1.3 ",
    );
    if (suites) lines.push("    # 设置 TLS 1.3 的对称加密和哈希算法套件。", `    ssl_conf_command Ciphersuites ${suites};`);
  }
  if (settings.tlsPreferServer)
    lines.push("    # 优先采用服务端指定的加密套件顺序。", "    ssl_prefer_server_ciphers on;");
  if (settings.tlsSessionCache)
    lines.push("    # 在工作进程之间共享 TLS 会话，缓存时间为一天。", "    ssl_session_cache shared:SSL:10m;", "    ssl_session_timeout 1d;");
  if (settings.tlsNoTickets)
    lines.push("    # 关闭 TLS 会话票据。", "    ssl_session_tickets off;");
  if (settings.tlsEarlyData)
    lines.push("    # 启用 TLS 1.3 早期数据，应用需处理重放风险。", "    ssl_early_data on;");
  if (settings.http2) lines.push("    # HTTPS 上的 HTTP/2 需要 http_v2 模块。", "    http2 on;");
  if (settings.http3) lines.push("    http3 on;", `    add_header Alt-Svc 'h3=":${port}"; ma=86400' always;`);
  if (settings.hsts) {
    const maxAge = integer(settings.hstsMaxAge ?? "31536000", "HSTS 有效期", 2147483647, 0);
    const subdomains = settings.hstsSubdomains ? "; includeSubDomains" : "";
    const policy = maxAge === 0
      ? "清除浏览器缓存的 HSTS 策略。"
      : `要求浏览器在有效期内通过 HTTPS 访问${subdomains ? "本站及其子域名" : "本站"}。`;
    lines.push(
      `    # HSTS ${policy}`,
      `    add_header Strict-Transport-Security "max-age=${maxAge}${subdomains}" always;`,
    );
  }
  return lines;
}

function staticLocations(settings) {
  const spa = settings.mode === "spa";
  const fallback = spa ? "/index.html" : "=404";
  const lines = [`    root ${quotePath(settings.root, "站点目录")};`, "    index index.html;", ""];
  if (spa) {
    // 入口文件缺失时返回 404，防止回退到同一 URI 形成循环。
    lines.push("    location = /index.html {", "        try_files $uri =404;", "    }", "");
  }
  if (settings.cacheAssets || (spa && settings.spaAssets404)) {
    const assetFallback = spa && !settings.spaAssets404 ? fallback : "=404";
    lines.push(`    location ~* ${ASSETS} {`);
    if (spa && settings.spaAssets404) lines.push("        # 缺失的静态资源直接返回 404。");
    lines.push(`        try_files $uri ${assetFallback};`);
    if (settings.cacheAssets) {
      const days = integer(settings.cacheDays, "缓存天数", Math.floor(2147483647 / 86400));
      lines.push("        # 设置匹配资源的缓存期限。", `        expires ${days}d;`);
    }
    lines.push("    }", "");
  }
  lines.push("    location / {");
  if (spa) lines.push("        # 找不到文件时交给前端路由处理。");
  lines.push(`        try_files $uri $uri/ ${fallback};`, "    }");
  return lines;
}

function proxyLocation(settings, route, location, otherPaths, secure) {
  const url = upstreamOrigin(route.upstream);
  const upstreamPath = route.upstreamPath?.trim();
  const target = url.origin + (upstreamPath ? uriPath(upstreamPath, "上游路径") : "");
  // 示例需命中本规则，避开更长前缀及其自动补斜杠的跳转。
  const defaultTail = location.endsWith("/") ? "example" : "/example";
  const exampleTail = [defaultTail, "example", "-example", ""].find((tail) => {
    const request = location + tail;
    return otherPaths.every((path) => !request.startsWith(path) && path !== request + "/");
  });
  const lines = [
    `    location ${location} {`,
    upstreamPath
      ? "        # 用上游路径替换匹配前缀，并保留查询参数。"
      : "        # 转发原始请求路径和查询参数。",
    ...(exampleTail === undefined ? [] : [
      `        # 转发示例 ${location}${exampleTail}?x=1 → 后端 ${upstreamPath || location}${exampleTail}?x=1`,
    ]),
    `        proxy_pass ${target};`,
    "        proxy_http_version 1.1;",
  ];
  if (settings.websocket) {
    lines.push(
      "        # WebSocket 握手需要配套传递 Upgrade 和 Connection。",
      "        proxy_set_header Upgrade $http_upgrade;",
      "        proxy_set_header Connection $qkit_connection_upgrade;",
    );
  } else {
    lines.push('        # 省略 Connection 请求头，避免向上游发送 close。', '        proxy_set_header Connection "";');
  }
  const forwardedFor = (settings.ipSource ?? "connection") === "connection"
    ? "$proxy_add_x_forwarded_for"
    : "$remote_addr";
  lines.push(
    "        # Host 用于上游路由，需要传访客域名时可改为 $host。",
    forwardedFor === "$remote_addr"
      ? "        # X-Real-IP 和 X-Forwarded-For 均使用解析后的访客 IP。"
      : "        # X-Real-IP 传单个地址，X-Forwarded-For 在原有链尾追加该地址。",
    "        # X-Forwarded-Host 和 X-Forwarded-Proto 传 Nginx 收到请求时的主机名和协议。",
    "        proxy_set_header Host $proxy_host;",
    "        proxy_set_header X-Real-IP $remote_addr;",
    "        proxy_set_header X-Forwarded-Host $host;",
    `        proxy_set_header X-Forwarded-For ${forwardedFor};`,
    "        proxy_set_header X-Forwarded-Proto $scheme;",
  );
  if (settings.proxyTimeout) {
    lines.push("        # 发送与读取超时分别计算两次操作之间的等待时间。");
    for (const [key, suffix, label] of [
      ["connectTimeout", "connect", "连接超时"],
      ["sendTimeout", "send", "发送超时"],
      ["readTimeout", "read", "读取超时"],
    ]) {
      lines.push(`        proxy_${suffix}_timeout ${integer(settings[key], label, 2147483647)}s;`);
    }
  }
  if (settings.disableBuffering)
    lines.push("        # 关闭响应缓冲，适合 SSE 等流式响应。", "        proxy_buffering off;");
  if (settings.https && settings.hsts) lines.push("        proxy_hide_header Strict-Transport-Security;");
  if (secure && settings.tlsEarlyData) lines.push("        proxy_set_header Early-Data $ssl_early_data;");
  if (settings.cors)
    lines.push(...CORS_HEADERS.map((header) => `        proxy_hide_header Access-Control-Allow-${header};`));
  if (settings.csp) lines.push("        proxy_hide_header Content-Security-Policy;");
  if (url.protocol === "https:") {
    lines.push(
      "",
      "        # 使用指定的 CA 验证上游 HTTPS 证书，并发送 SNI。",
      "        proxy_ssl_server_name on;",
      "        proxy_ssl_verify on;",
      "        proxy_ssl_verify_depth 3;",
      `        proxy_ssl_trusted_certificate ${quotePath(route.certificate, "上游 CA 证书路径")};`,
    );
  }
  return [...lines, "    }"];
}

function proxyLocations(settings, secure) {
  const routes = settings.locations ?? [settings];
  if (!routes.length) throw new Error("请添加至少一条转发规则");
  const paths = routes.map((route) => uriPath(route.locationPath ?? "/", "匹配路径"));
  const seen = new Set();
  for (const path of paths) {
    if (seen.has(path)) throw new Error(`匹配路径 ${path} 重复`);
    seen.add(path);
  }
  return routes.flatMap((route, index) => {
    const path = paths[index];
    const longerPaths = paths.filter((other) => other.length > path.length && other.startsWith(path));
    const lines = proxyLocation(settings, route, path, longerPaths, secure);
    return index ? ["", ...lines] : lines;
  });
}

export function generateNginxConfig(settings) {
  const names = [...new Set((settings.name ?? "").split(/[\s,，]+/).filter(Boolean).map(serverName))];
  const [primaryName] = names;
  if (!primaryName) throw new Error("请输入至少一个域名或 IPv4 地址");
  const httpPort = integer(settings.port, "监听端口", 65535);
  const tlsPort = settings.https ? integer(settings.tlsPort, "HTTPS 端口", 65535) : null;
  if (tlsPort === httpPort) throw new Error("HTTP 与 HTTPS 监听端口不能相同");
  const redirect = tlsPort && settings.redirectHttp;
  const proxyFlag = settings.proxyProtocol ? " proxy_protocol" : "";
  const proxyProtocolNote = settings.proxyProtocol
    ? ["    # TCP 连接需要由前置负载均衡器发送 PROXY protocol 头。"]
    : [];
  const listen = `    listen ${httpPort}${proxyFlag};`;
  const server = `    server_name ${names.join(" ")};`;
  const ip = realIpDirectives(settings);
  const logs = logDirectives(settings);
  const access = accessDirectives(settings, `qkit_req_${primaryName}_${httpPort}`);
  const tokens = settings.hideVersion
    ? ["    # 在 Server 响应头和错误页中隐藏 Nginx 版本号。", "    server_tokens off;"]
    : [];
  const botBlock = botDirectives(settings);
  const directives = [...ip, ...logs.server, ...tokens, ...botBlock, ...access.server, ...compressionDirectives(settings)];
  if (settings.hideRedirectPort)
    directives.push("    # Nginx 自动生成的绝对跳转地址省略端口。", "    port_in_redirect off;");
  if (settings.limitUpload) {
    const size = integer(settings.uploadSize, "上传大小上限", Math.floor(Number.MAX_SAFE_INTEGER / 1048576), 0);
    directives.push("    # 限制请求体大小，0 表示不限制。", `    client_max_body_size ${size}m;`);
  }
  const robots = robotsLocation(settings);
  const body = (secure) => [
    ...(directives.length ? [...directives, ""] : []),
    ...robots,
    ...(settings.mode === "proxy" ? proxyLocations(settings, secure) : staticLocations(settings)),
    "}", "",
  ];
  const lines = [...logs.http, ...access.http];

  if (settings.mode === "proxy" && settings.websocket) {
    lines.push(
      "# 在 http 块中映射 WebSocket 升级请求，普通请求无需升级。",
      "map $http_upgrade $qkit_connection_upgrade {", "    default upgrade;", '    "" "";', "}", "",
    );
  }
  if (redirect) {
    if (primaryName === "_") throw new Error("HTTP 跳转 HTTPS 需要将实际域名或 IPv4 地址放在首位");
    const status = String(settings.redirectStatus ?? "302");
    if (!["301", "302", "307", "308"].includes(status)) throw new Error("请选择有效的 HTTPS 跳转状态码");
    const duration = status === "301" || status === "308" ? "永久" : "临时";
    const preserved = status === "307" || status === "308" ? "路径、查询参数和请求方法" : "路径和查询参数";
    const authority = tlsPort === 443 ? primaryName : `${primaryName}:${tlsPort}`;
    lines.push(
      "server {", ...proxyProtocolNote, listen, server, ...ip, ...logs.server, ...tokens, ...botBlock,
      `    # 将 HTTP 请求${duration}跳转到 HTTPS，保留${preserved}。`,
      `    return ${status} https://${authority}$request_uri;`, "}", "",
    );
  } else {
    lines.push("server {", ...proxyProtocolNote, listen, server, "", ...body(false));
  }

  if (tlsPort) {
    // HSTS、Alt-Svc 和 TLS 协议指令仅用于 HTTPS 监听。
    lines.push("server {", ...proxyProtocolNote, `    listen ${tlsPort} ssl${proxyFlag};`);
    if (settings.http3)
      lines.push("    # HTTP/3 使用 QUIC，需要开放此 UDP 端口。", `    listen ${tlsPort} quic;`);
    lines.push(server, "", ...tlsDirectives(settings, tlsPort), "", ...body(true));
  }
  return lines.join("\n");
}
