import test from "node:test";
import assert from "node:assert/strict";
import { generateNginxConfig } from "../src/tools/nginx-config.js";

const BASE = {
  mode: "static",
  name: "example.com",
  port: "80",
  root: "/var/www/site",
  upstream: "http://127.0.0.1:3000",
};
const TLS = {
  https: true,
  tlsPort: "4443",
  tlsCert: "/etc/nginx/ssl/fullchain.pem",
  tlsKey: "/etc/nginx/ssl/privkey.pem",
};
const LOGS = {
  logs: true,
  accessLog: "/var/log/nginx/access.log",
  errorLog: "/var/log/nginx/error.log",
};

test("HTTPS 跳转、HTTP/2、HTTP/3 和 PROXY protocol 使用对应的监听", () => {
  const config = generateNginxConfig({
    ...BASE, ...TLS, redirectHttp: true, http2: true, http3: true, proxyProtocol: true,
    ipSource: "protocol", trustedNetworks: "127.0.0.1, 2001:db8::/32",
  });
  assert.match(config, /listen 80 proxy_protocol;/);
  assert.match(config, /return 302 https:\/\/example\.com:4443\$request_uri;/);
  assert.match(config, /listen 4443 ssl proxy_protocol;\n    # HTTP\/3 [^\n]+\n    listen 4443 quic;/);
  assert.match(config, /http2 on;\n    http3 on;/);
  assert.match(config, /Alt-Svc 'h3=":4443"; ma=86400' always;/);
  assert.match(config, /set_real_ip_from 127\.0\.0\.1;\n    set_real_ip_from 2001:db8::\/32;\n    real_ip_header proxy_protocol;/);
  assert.throws(() => generateNginxConfig({ ...BASE, ...TLS, tlsPort: BASE.port }), /监听端口不能相同/);
  assert.throws(() => generateNginxConfig({ ...BASE, ipSource: "protocol" }), /开启 PROXY protocol/);
});

test("TLS 协议和各版本的套件可独立设置", () => {
  const config = generateNginxConfig({
    ...BASE, ...TLS, tls12CipherProfile: "both", tls13CipherProfile: "custom",
    tls13Ciphers: "TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256",
  });
  assert.match(config, /ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:[^']+:ECDHE-RSA-CHACHA20-POLY1305';/);
  assert.match(config, /ssl_conf_command Ciphersuites TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256;/);
  const tls12 = generateNginxConfig({ ...BASE, ...TLS, tlsProtocols: "TLSv1.2", tls13CipherProfile: "aes" });
  assert.match(tls12, /ssl_protocols TLSv1.2;/);
  assert.doesNotMatch(tls12, /ssl_conf_command/);
  assert.throws(() => generateNginxConfig({
    ...BASE, ...TLS, tlsProtocols: "TLSv1.2", http3: true,
  }), /HTTP\/3 需要启用 TLS 1.3/);
  assert.throws(() => generateNginxConfig({
    ...BASE, ...TLS, tls12CipherProfile: "custom", tls12Ciphers: "AES; include x",
  }), /TLS 1.2 加密套件/);
});

test("TLSRef 推荐套件可分别选择，与协议、曲线和协商顺序独立", () => {
  const settings = {
    ...BASE, ...TLS, tls12CipherProfile: "both", tls13CipherProfile: "both",
    tlsCurves: "X25519:prime256v1", tlsPreferServer: true,
  };
  const tls12 = generateNginxConfig({ ...settings, tlsProtocols: "TLSv1.2" });
  assert.match(tls12, /ssl_protocols TLSv1.2;/);
  assert.match(tls12, /ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';/);
  assert.doesNotMatch(tls12, /Ciphersuites/);
  const tls13 = generateNginxConfig({ ...settings, tlsProtocols: "TLSv1.3" });
  assert.match(tls13, /ssl_protocols TLSv1.3;/);
  assert.match(tls13, /Ciphersuites TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256;/);
  assert.doesNotMatch(tls13, /ssl_ciphers /);
  for (const config of [tls12, tls13]) {
    assert.match(config, /ssl_ecdh_curve X25519:prime256v1;/);
    assert.match(config, /ssl_prefer_server_ciphers on;/);
  }
});

test("多个站点名称共用配置，跳转到首个名称并使用所选状态码", () => {
  const settings = { ...BASE, ...TLS, redirectHttp: true, name: "EXAMPLE.com，www.example.com  example.com" };
  for (const [redirectStatus, duration] of [["301", "永久"], ["302", "临时"], ["307", "临时"], ["308", "永久"]]) {
    const config = generateNginxConfig({ ...settings, redirectStatus, blockBots: true });
    assert.equal(config.match(/server_name example\.com www\.example\.com;/g)?.length, 2);
    assert.equal(config.match(/return 403;/g)?.length, 2);
    assert.ok(config.indexOf("return 403;") < config.indexOf(`return ${redirectStatus}`));
    assert.ok(config.includes(`将 HTTP 请求${duration}跳转到 HTTPS`));
    assert.ok(config.includes(`return ${redirectStatus} https://example.com:4443$request_uri;`));
  }
  assert.throws(() => generateNginxConfig({ ...settings, redirectStatus: "404" }), /跳转状态码/);
  assert.throws(() => generateNginxConfig({ ...settings, name: "example.com; include x;" }), /域名或 IPv4/);
});

test("TLS 高级指令只在 HTTPS 生成，同时向其反代上游传递 Early-Data", () => {
  const settings = {
    ...BASE, ...TLS, mode: "proxy", tlsCurves: "X25519MLKEM768:X25519:prime256v1:secp384r1",
    tls13CipherProfile: "both", tlsPreferServer: true, tlsSessionCache: true, tlsNoTickets: true, tlsEarlyData: true,
  };
  const [http, https] = generateNginxConfig(settings).split("server {").slice(1);
  assert.doesNotMatch(http, /ssl_early_data|Early-Data/);
  assert.match(https, /ssl_ecdh_curve X25519MLKEM768:X25519:prime256v1:secp384r1;/);
  assert.match(https, /Ciphersuites TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256;/);
  assert.match(https, /ssl_prefer_server_ciphers on;/);
  assert.match(https, /ssl_session_cache shared:SSL:10m;\n    ssl_session_timeout 1d;/);
  assert.match(https, /ssl_session_tickets off;/);
  assert.match(https, /ssl_early_data on;/);
  assert.match(https, /proxy_set_header Early-Data \$ssl_early_data;/);
  assert.throws(() => generateNginxConfig({ ...settings, tlsProtocols: "TLSv1.2" }), /0-RTT 需要启用 TLS 1.3/);
});

test("限流、CORS 和 CSP 生成相应作用域的指令", () => {
  const settings = {
    ...BASE, mode: "proxy", limitReq: true, requestRate: "5", requestBurst: "0", hideRedirectPort: true,
    cors: true, corsOrigin: "https://app.example.com", corsCredentials: true, csp: true,
  };
  const config = generateNginxConfig(settings);
  const [http, server] = config.split("server {");
  assert.match(http, /limit_req_zone \$binary_remote_addr zone=qkit_req_example\.com_80:10m rate=5r\/s;/);
  assert.match(http, /\$qkit_cors_preflight \{/);
  assert.match(server, /limit_req zone=qkit_req_example\.com_80;\n    limit_req_status 429;/);
  assert.match(server, /port_in_redirect off;/);
  assert.match(server, /Access-Control-Allow-Origin "https:\/\/app\.example\.com" always;/);
  assert.match(server, /Access-Control-Allow-Credentials true always;/);
  assert.match(server, /Content-Security-Policy "default-src 'self'; object-src 'none'; base-uri 'self'" always;/);
  assert.match(server, /proxy_hide_header Content-Security-Policy;/);
  assert.throws(() => generateNginxConfig({ ...settings, corsOrigin: "*" }), /凭据/);
  assert.throws(() => generateNginxConfig({ ...settings, cspPolicy: '" always; include x;' }), /CSP 策略/);
});

test("压缩参数按算法生效，静态文件选项用于静态站点和 SPA", () => {
  const settings = {
    ...BASE, gzip: true, gzipStatic: true, gzipVary: false, gzipProxied: "uncached",
    gzipLevel: "4", gzipMinLength: "512", gzipTypes: "text/html,text/css, application/json text/css",
    brotli: true, brotliStatic: true, brotliLevel: "0", brotliMinLength: "100", brotliTypes: "*",
  };
  const config = generateNginxConfig(settings);
  assert.match(config, /gzip_comp_level 4;\n    gzip_min_length 512;\n    gzip_types text\/css application\/json;/);
  assert.match(config, /gzip_static on;\n    gzip_vary off;/);
  assert.match(config, /gzip_proxied expired no-cache no-store private;/);
  assert.match(config, /brotli_comp_level 0;\n    brotli_min_length 100;\n    brotli_types \*;/);
  assert.match(config, /brotli_static on;/);
  assert.doesNotMatch(generateNginxConfig({ ...settings, mode: "proxy" }), /(?:gzip|brotli)_static/);
  assert.throws(() => generateNginxConfig({ ...settings, gzipLevel: "0" }), /Gzip 压缩级别/);
  assert.throws(() => generateNginxConfig({ ...settings, brotliTypes: "text/css; include x" }), /Brotli MIME 类型/);
});

test("自定义访客 IP 请求头仍受可信代理网段约束", () => {
  const settings = { ...BASE, mode: "proxy", ipSource: "custom", ipHeader: "CF-Connecting-IP", trustedNetworks: "192.0.2.0/24" };
  const config = generateNginxConfig(settings);
  assert.match(config, /set_real_ip_from 192\.0\.2\.0\/24;\n    real_ip_header CF-Connecting-IP;/);
  assert.match(config, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.throws(() => generateNginxConfig({ ...settings, trustedNetworks: "" }), /可信代理/);
  assert.throws(() => generateNginxConfig({ ...settings, ipHeader: "X-IP; include x" }), /访客 IP 请求头/);
});

test("爬虫分类和自定义关键词可组合，发布的 robots.txt 仍可读取", () => {
  const settings = { ...BASE, blockBots: true, blockSearchBots: true, botKeywords: "ExampleCrawler/1.2" };
  const search = generateNginxConfig(settings);
  assert.match(search, /\(examplecrawler\/1\[\.\]2\|googlebot\|bingbot\|duckduckbot\)/);
  assert.doesNotMatch(search, /gptbot/);
  const robots = generateNginxConfig({
    ...settings, blockSearchBots: false, blockAiBots: true, botKeywords: "", robotsTxt: true,
    robotsMode: "custom", robotsContent: "User-agent: GPTBot\r\nDisallow: /archive/\r\n",
  });
  assert.match(robots, /if \(\$uri = \/robots\.txt\) \{\n        set \$qkit_bot_agent "";/);
  assert.match(robots, /if \(\$qkit_bot_agent ~\* "\(gptbot\|oai-searchbot/);
  assert.match(robots, /location = \/robots\.txt \{/);
  assert.match(robots, /return 200 "User-agent: GPTBot\\nDisallow: \/archive\/\\n";/);
  assert.throws(() => generateNginxConfig({ ...settings, botKeywords: "bot|.*" }), /爬虫关键词/);
});

test("HSTS 只由 HTTPS 监听输出，并覆盖上游的 HSTS 头", () => {
  const config = generateNginxConfig({ ...BASE, ...TLS, mode: "proxy", hsts: true, hstsSubdomains: true });
  const [http, https] = config.split("server {").slice(1);
  assert.doesNotMatch(http, /add_header Strict-Transport-Security/);
  assert.match(https, /add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/);
  assert.match(https, /proxy_hide_header Strict-Transport-Security;/);
  assert.match(generateNginxConfig({ ...BASE, ...TLS, hsts: true, hstsMaxAge: "0" }), /"max-age=0" always;/);
});

test("反代路径留空时省略 URI，填写时按原样生成上游前缀", () => {
  const settings = { ...BASE, mode: "proxy", locationPath: "/api/" };
  const original = generateNginxConfig(settings);
  assert.match(original, /location \/api\/ \{\n        # 转发原始请求路径和查询参数。\n        # 转发示例 \/api\/example\?x=1 → 后端 \/api\/example\?x=1\n        proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  for (const path of ["/", "/backend/"]) {
    assert.ok(generateNginxConfig({ ...settings, upstreamPath: path }).includes(`proxy_pass http://127.0.0.1:3000${path};`));
  }
  for (const [locationPath, upstreamPath, exampleBackend] of [
    ["/dawd/", "/dwa", "/dwaexample"],
    ["/dawd/", "/dwa/", "/dwa/example"],
    ["/dawd", "/dwa/", "/dwa//example"],
    ["/", "/", "/example"],
  ]) {
    const config = generateNginxConfig({ ...settings, locationPath, upstreamPath });
    assert.ok(config.includes(`→ 后端 ${exampleBackend}?x=1\n        proxy_pass`));
  }
  const config = generateNginxConfig({
    ...settings, websocket: true, proxyTimeout: true, disableBuffering: true,
    connectTimeout: "10", sendTimeout: "20", readTimeout: "30",
    ipSource: "forwarded", trustedNetworks: "127.0.0.1",
  });
  assert.match(config, /^# [^\n]+WebSocket[^\n]+\nmap \$http_upgrade \$qkit_connection_upgrade \{/);
  assert.match(config, /proxy_set_header Connection \$qkit_connection_upgrade;/);
  assert.match(config, /real_ip_recursive on;/);
  assert.match(config, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(config, /proxy_connect_timeout 10s;\n        proxy_send_timeout 20s;\n        proxy_read_timeout 30s;/);
  assert.match(config, /# 关闭响应缓冲[^\n]+\n        proxy_buffering off;/);
  assert.throws(() => generateNginxConfig({ ...settings, locationPath: "/api; include x" }), /匹配路径/);
  assert.throws(() => generateNginxConfig({ ...settings, ipSource: "forwarded", trustedNetworks: "127.0.0.1/33" }), /可信代理/);
});

test("反向代理按规则生成各自的路径、上游和 CA 配置", () => {
  const settings = {
    ...BASE, mode: "proxy", websocket: true, locations: [
      { locationPath: "/", upstream: "http://127.0.0.1:3000" },
      { locationPath: "/api/", upstream: "https://api.example.com:8443", upstreamPath: "/v1/", certificate: "/etc/nginx/api-ca.pem" },
    ],
  };
  const config = generateNginxConfig(settings);
  const [fallback, api] = config.split("    location ").slice(1);
  assert.match(fallback, /^\/ \{\n[^}]+proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.doesNotMatch(fallback, /proxy_ssl/);
  assert.match(api, /^\/api\/ \{\n[^}]+proxy_pass https:\/\/api\.example\.com:8443\/v1\//);
  assert.match(api, /proxy_ssl_trusted_certificate "\/etc\/nginx\/api-ca\.pem";/);
  assert.equal(config.match(/proxy_set_header Upgrade/g)?.length, 2);
  const overlapping = generateNginxConfig({
    ...settings, locations: [settings.locations[0], { ...settings.locations[1], locationPath: "/example" }],
  });
  assert.match(overlapping.split("    location ")[1], /转发示例 \/-example\?x=1 → 后端 \/-example\?x=1/);
  assert.throws(() => generateNginxConfig({
    ...settings, locations: [...settings.locations, { ...settings.locations[1], locationPath: " /api/ " }],
  }), /匹配路径 \/api\/ 重复/);
  assert.throws(() => generateNginxConfig({ ...settings, locations: [] }), /至少一条转发规则/);
});

test("SPA 静态资源 404 和缓存与入口回退分开", () => {
  const config = generateNginxConfig({
    ...BASE, mode: "spa", cacheAssets: true, cacheDays: "7", spaAssets404: true,
    gzip: true, brotli: true, hideVersion: true, limitUpload: true, uploadSize: "0",
  });
  assert.match(config, /server_tokens off;/);
  assert.match(config, /client_max_body_size 0m;/);
  assert.match(config, /gzip on;/);
  assert.match(config, /brotli on;/);
  assert.match(config, /location ~\* .*\\\.\(\?:css.*\{\n        # [^\n]+\n        try_files \$uri =404;\n        # [^\n]+\n        expires 7d;\n    \}/);
  assert.match(config, /location \/ \{\n        # [^\n]+\n        try_files \$uri \$uri\/ \/index\.html;/);
});

test("配置只定义一次访问日志格式，并在 HTTPS 和跳转站点中复用", () => {
  const defaults = generateNginxConfig({ ...BASE, ...LOGS });
  assert.match(defaults, /access_log "\/var\/log\/nginx\/access\.log";/);
  assert.doesNotMatch(defaults, /log_format/);
  const config = generateNginxConfig({
    ...BASE, ...TLS, ...LOGS, redirectHttp: true, customLogFormat: true,
    logEscape: "json", logFormatName: "qkit_json",
    logPattern: "{\n  \"request\": \"$request\", \"label\": \"it's \\\\ kept\"\n}",
  });
  assert.equal(config.split("\n")[1], String.raw`log_format qkit_json escape=json '{ "request": "$request", "label": "it\'s \\\\ kept" }';`);
  assert.equal(config.match(/access_log "\/var\/log\/nginx\/access\.log" qkit_json;/g)?.length, 2);
  assert.throws(() => generateNginxConfig({
    ...BASE, ...LOGS, customLogFormat: true, logFormatName: "Combined", logPattern: "$request",
  }), /日志格式名称/);
  assert.throws(() => generateNginxConfig({
    ...BASE, ...LOGS, customLogFormat: true, logFormatName: "qkit_json", logPattern: " ",
  }), /有效的访问日志格式/);
});

test("开启功能时才在其指令旁生成注释", () => {
  assert.doesNotMatch(generateNginxConfig(BASE), /^\s*#/m);
  const gzip = generateNginxConfig({ ...BASE, gzip: true });
  assert.match(gzip, /# [^\n]+Gzip[^\n]+\n    gzip on;/);
  assert.doesNotMatch(gzip, /Brotli|HSTS|PROXY protocol/);
  const https = generateNginxConfig({ ...BASE, ...TLS, hsts: true, hstsSubdomains: true });
  assert.match(https, /# HSTS [^\n]+本站及其子域名。\n    add_header Strict-Transport-Security/);
  assert.doesNotMatch(generateNginxConfig({ ...BASE, ...TLS }), /HSTS|Strict-Transport-Security/);
});
