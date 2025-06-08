# Cloudflare Workers WebDAV 图床

这是一个基于 Cloudflare Workers 的图床网站，它利用 WebDAV 将图片存储在你的网盘中。前端页面部署在 Cloudflare Workers 上，提供便捷的图片上传和管理功能。

## 特性

*   **图片上传页面：**
    *   支持图片拖放上传。
    *   支持通过文件选择器导入图片。
    *   上传成功后显示图片访问地址，并支持一键复制。
    *   提供上传进度提示。

*   **后台管理页面：**
    *   通过账号密码登录进行访问。
    *   用于配置 WebDAV 连接（通过 Cloudflare Workers Secrets 设置）。
    *   查看和管理网盘中的图片文件。
    *   删除已上传的图片。

## 部署设置

### 前提条件

在部署之前，请确保你已经安装了以下工具：

*   [Node.js](https://nodejs.org/en/) (推荐 LTS 版本)
*   [npm](https://www.npmjs.com/) (通常随 Node.js 一起安装)
*   [Wrangler](https://developers.cloudflare.com/workers/wrangler/get-started/)：Cloudflare Workers 的命令行工具。
    ```bash
    npm install -g wrangler
    ```

### 配置 WebDAV 凭据

由于安全原因，WebDAV 的用户名、密码和 URL 需要作为 Cloudflare Workers 的 Secrets 进行配置。这些变量不会直接暴露在代码中。

1.  **登录 Cloudflare：** 确保你已登录到 Cloudflare 账户。
2.  **设置 Secrets：** 使用 Wrangler 命令行工具设置以下 Secrets：
    ```bash
    wrangler secret put WEBDAV_URL
    # 提示输入 WebDAV 服务器的 URL，例如：https://dav.jianguoyun.com/dav/

    wrangler secret put WEBDAV_USERNAME
    # 提示输入你的 WebDAV 用户名

    wrangler secret put WEBDAV_PASSWORD
    # 提示输入你的 WebDAV 密码
    ```
    这些 Secrets 将在你的 Worker 中作为环境变量 `env.WEBDAV_URL`、`env.WEBDAV_USERNAME` 和 `env.WEBDAV_PASSWORD` 可用。

### 部署到 Cloudflare Workers

1.  **项目文件：** 确保你的 Worker 代码（目前所有前端和后端逻辑都包含在 `src/worker.js` 中）已准备就绪。

2.  **部署命令：** 在项目根目录下运行 Wrangler 部署命令：
    ```bash
    wrangler deploy
    ```
    Wrangler 将会打包你的 Worker 并将其部署到你的 Cloudflare 账户。

## 使用说明

部署成功后，你将获得一个 Cloudflare Workers 的 URL。你可以通过以下方式使用图床：

*   **图片上传：** 访问 Worker 的主 URL (例如 `https://your-worker-name.your-account.workers.dev/`)。你可以在该页面拖放、选择文件或粘贴图片进行上传。


## 已知问题与未来改进

*   **图片访问速度：** 已引入缓存机制以优化图片访问速度，但仍需进一步观察和调整以确保最佳性能。
