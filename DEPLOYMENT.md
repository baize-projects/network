# Docker 部署文档

本项目只保留 Docker 部署方式。面板敏感信息不再通过环境变量配置；第一次打开 `ip:端口` 时必须输入一次性初始化口令，再创建管理员账户、强制绑定 2FA，并在第二页录入一个或多个 Cloudflare 账号。数据持久化到 SQLite，默认路径为 `/data/panel.sqlite`；2FA seed 和 Cloudflare Global API Key 使用密钥材料派生密钥加密落盘。

## 运行要求

- Docker Engine 或兼容运行时。
- 宿主机能访问 `https://api.cloudflare.com/client/v4`。
- 生产环境建议放在 HTTPS 反向代理后。
- 必须挂载 `/data`，否则容器重建后初始化账户和 Cloudflare 账号会丢失。

## 快速运行

```bash
docker run -d \
  --name cloudflare-preferred-panel \
  --restart unless-stopped \
  -p 3000:3000 \
  -v cloudflare-panel-data:/data \
  baize233/network:latest
```

打开：

```text
http://服务器IP:3000
```

首次初始化分两页完成：

1. 运行 `docker logs cloudflare-preferred-panel` 查看 `Initial setup token` 掩码和读取提示。
2. 默认完整口令不进入日志，执行下面命令读取：

   ```bash
   docker exec cloudflare-preferred-panel cat /data/setup-token.txt
   ```

   如果你显式设置了 `SETUP_TOKEN`，则使用你配置的值，应用不会再生成 `/data/setup-token.txt`。
3. 第 1 页输入初始化口令。
4. 生成 2FA 登录密钥，复制到身份验证器。
5. 输入管理员用户名、密码、确认密码和当前 6 位 2FA 验证码，创建管理员并进入下一步。
6. 第 2 页录入一个或多个 Cloudflare 账号名称、登录邮箱和 Global API Key。
7. 保存后浏览器继续使用 HttpOnly 会话 Cookie，进入管理面板。

## 可选运行参数

只允许通过环境变量配置非敏感运行参数：

```bash
PORT=3000
DATA_DIR=/data
SESSION_TTL_DAYS=30
SECURE_COOKIES=false
PUBLIC_ORIGIN=
TRUST_PROXY_HEADERS=false
CLOUDFLARE_REQUEST_TIMEOUT_MS=15000
ENABLE_D1_SQL_CONSOLE=false
ENABLE_D1_SQL_MUTATIONS=false
RATE_LIMIT_ATTEMPTS=8
RATE_LIMIT_WINDOW_MS=900000
# SETUP_TOKEN_PATH=/data/setup-token.txt
# PANEL_SECRET_KEY_FILE=/run/secrets/cf-panel-secret
# CLOUDFLARE_API_BASE_URL=https://api.cloudflare.com/client/v4
```

不要再设置 `USER`、`PASSWORD`、`AUTH`、`EMAIL1`、`CF_API1` 等敏感环境变量。它们已经不被应用读取。

## docker compose

```yaml
services:
  cloudflare-panel:
    image: baize233/network:latest
    container_name: cloudflare-preferred-panel
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - cloudflare-panel-data:/data
    environment:
      PORT: "3000"
      DATA_DIR: /data
      SESSION_TTL_DAYS: "30"
      SECURE_COOKIES: "false"
      PUBLIC_ORIGIN: "https://panel.example.com"
      TRUST_PROXY_HEADERS: "true"
      ENABLE_D1_SQL_CONSOLE: "false"

volumes:
  cloudflare-panel-data:
```

启动：

```bash
docker compose up -d
docker compose logs -f
```

## HTTPS 与 Cookie

默认 Docker 镜像允许直接通过 `http://服务器IP:端口` 首次初始化；这种访问方式下会话 Cookie 不带 `Secure`，浏览器可以正常保存第 1 页创建管理员后的会话。

推荐做法：

- 生产环境：放在 HTTPS 反向代理后，设置 `PUBLIC_ORIGIN=https://你的域名`，应用会自动给会话 Cookie 加 `Secure`。
- 只有反向代理会覆盖和清洗 `Host`、`X-Forwarded-Proto` 时，才设置 `TRUST_PROXY_HEADERS=true`。
- 如果必须强制所有会话 Cookie 带 `Secure`，设置 `SECURE_COOKIES=true`，并确保只通过 HTTPS 访问。

如果你已经在旧版本中第 1 页创建了管理员，但第 2 页保存 Cloudflare 账号时提示“请先创建管理员账户并登录”，新版第 2 页会显示“恢复管理员会话”，用管理员用户名、密码和 2FA 登录后即可继续添加账号，不需要删除 SQLite。

Nginx 示例：

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

不要把应用直接暴露在会被客户端伪造 `Host` 或 `X-Forwarded-Proto` 的链路后面。同源校验默认不信任 `X-Forwarded-Proto`；显式 `PUBLIC_ORIGIN` 优先级最高。

## 加密密钥分离

默认情况下，应用会在 `/data/secret.key` 创建本地加密密钥；这样便于单容器部署，但如果 `/data/panel.sqlite` 和 `/data/secret.key` 同时泄露，就可以解密 Cloudflare Global API Key 和 2FA seed。

生产建议把密钥材料放到 Docker secret 或独立只读挂载：

```yaml
services:
  cloudflare-panel:
    image: baize233/network:latest
    volumes:
      - cloudflare-panel-data:/data
      - ./secrets/cf-panel-secret:/run/secrets/cf-panel-secret:ro
    environment:
      PANEL_SECRET_KEY_FILE: /run/secrets/cf-panel-secret
```

密钥文件内容至少 32 个字符。使用外部密钥后，备份时应分开保护数据库和密钥材料；丢失密钥将无法解密既有敏感字段。

## D1 SQL 控制台

面板可以管理 Cloudflare D1 资源，但 SQL 控制台默认关闭：

- `ENABLE_D1_SQL_CONSOLE=false`：完全拒绝手写 SQL 查询。
- `ENABLE_D1_SQL_CONSOLE=true`：只允许单条 `SELECT/WITH` 查询。
- `ENABLE_D1_SQL_CONSOLE=true` 且 `ENABLE_D1_SQL_MUTATIONS=true`：允许写入、DDL 等 mutation 语句。

最后一种等价于“已登录面板用户可对 Cloudflare D1 执行任意 SQL”，只建议在临时维护窗口打开，用完关闭。

## 备份与恢复

备份 SQLite 数据和加密密钥：

```bash
docker run --rm \
  -v cloudflare-panel-data:/data \
  -v "$PWD":/backup \
  alpine sh -c 'cp /data/panel.sqlite /backup/panel.sqlite.backup && cp /data/secret.key /backup/secret.key.backup'
```

如果使用 `PANEL_SECRET_KEY_FILE`，不要把外部密钥和 SQLite 备份放在同一个公开备份位置。

恢复前先停止容器，并同时恢复 SQLite 与加密密钥：

```bash
docker stop cloudflare-preferred-panel
docker run --rm \
  -v cloudflare-panel-data:/data \
  -v "$PWD":/backup \
  alpine sh -c 'cp /backup/panel.sqlite.backup /data/panel.sqlite && cp /backup/secret.key.backup /data/secret.key'
docker start cloudflare-preferred-panel
```

## 升级

```bash
docker pull baize233/network:latest
docker stop cloudflare-preferred-panel
docker rm cloudflare-preferred-panel
docker run -d \
  --name cloudflare-preferred-panel \
  --restart unless-stopped \
  -p 3000:3000 \
  -v cloudflare-panel-data:/data \
  baize233/network:latest
```

Compose：

```bash
docker compose pull
docker compose up -d
```

## Docker Hub 自动构建

仓库保留 `.github/workflows/docker-image.yml`。每次推送 `main` 或 `v*` tag 时，workflow 会：

1. 使用 Node.js 24 检查 JavaScript 语法。
2. 使用 Node.js 24 运行 `node --test test/**/*.test.js`。
3. 构建 `linux/amd64` 和 `linux/arm64` Docker 镜像。
4. 如果配置了 Docker Hub secrets，则推送镜像。

需要在 GitHub Actions Secrets 配置：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `DOCKERHUB_REPOSITORY`，可选，例如 `baize233/network`

未配置 Docker Hub secrets 时，workflow 仍会测试和构建镜像，但跳过推送。

## 安全检查

- 不提交真实 SQLite 数据库、截图、私钥、证书、Cloudflare Global API Key 或管理员密码。
- 未完成首次初始化前，`/api/setup/secret` 和管理员创建接口必须校验一次性初始化口令；默认完整口令只写入 `/data/setup-token.txt`，日志只显示掩码。
- `/api/setup/secret`、管理员初始化和登录接口都有按来源地址的限速保护。
- 2FA seed 和 Cloudflare Global API Key 使用 AES-GCM 加密后落 SQLite；`/data/secret.key` 或外部 `PANEL_SECRET_KEY_FILE` 泄露等级等同密钥材料。
- 浏览器 Cookie 只保存随机 session id；状态修改接口要求 CSRF token，并做同源来源校验。
- 静态页和 JSON 响应带 CSP、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy` 等安全响应头。
- 操作历史不记录请求体，不保存密码、2FA 密钥或 Global API Key。
- D1 SQL 控制台默认关闭；开启后默认只读，写入类 SQL 需要额外设置 `ENABLE_D1_SQL_MUTATIONS=true`。
- `/data/panel.sqlite` 和密钥材料应纳入服务器备份策略，并限制宿主机文件访问权限。

## 验收

部署后建议逐项检查：

1. 首次打开 `http://服务器IP:端口` 能进入初始化页。
2. 未初始化时访问 `/api/zones` 返回“请先完成首次初始化”。
3. 日志不包含完整初始化口令，默认可以通过 `/data/setup-token.txt` 读取。
4. 没有初始化口令时不能获取 2FA seed，连续错误请求会触发 429 限速。
5. 初始化必须输入 2FA 当前验证码。
6. 第 2 页默认显示多行 Cloudflare 账号输入，只填有效账号行即可保存。
7. 初始化完成后能列出 Cloudflare 域名。
8. 不带 CSRF token 的已登录写操作返回 403。
9. 重新创建容器并挂载同一个 volume 后，不再要求重新初始化。
10. 清理浏览器 Cookie 后访问后台需要重新登录。
