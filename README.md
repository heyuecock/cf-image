# Cloudflare Workers 图片上传服务

这是一个基于 Cloudflare Workers 的图片上传服务，支持多种图片格式，提供简单易用的上传界面和图片管理功能。

## 功能特性

- 🖼️ 支持多种图片格式：
  - JPEG/JPG
  - PNG
  - GIF
  - TIFF
  - BMP
  - ICO
  - PSD
  - WebP
  - SVG

- 🔄 主要功能：
  - 拖拽上传
  - 多文件同时上传
  - 剪贴板粘贴上传
  - 图片预览
  - 图片轮播展示
  - 支持子目录管理
  - 自动生成图片链接

- 🛡️ 安全特性：
  - 文件类型验证
  - 文件大小限制
  - 请求频率限制
  - 并发上传控制
  - 安全的文件名生成

- ⚡ 性能优化：
  - 内存缓存
  - 图片缓存策略
  - 并发上传控制
  - 自动清理过期缓存

## 环境要求

- Cloudflare Workers 账户
- WebDAV 存储服务
- Node.js 16+ (用于本地开发)

## 配置说明

在 Cloudflare Workers 中需要配置以下环境变量：

```env
WEBDAV_URL=你的WebDAV服务器地址
WEBDAV_USERNAME=WebDAV用户名
WEBDAV_PASSWORD=WebDAV密码
UPLOAD_PAGE_PATH=上传页面路径（可选，默认为 'upload'）
```

## 部署步骤

1. 登录 Cloudflare 账户，进入 Workers & Pages 面板。
2. 点击 "创建应用程序" 或 "创建 Workers"。
3. 选择 "部署 Worker"。
4. 选择 "从 URL 克隆" 或 "从 GitHub 连接"，并将项目代码导入。
5. 在 "设置" -> "变量" 中，添加必要的环境变量（`WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD`, `UPLOAD_PAGE_PATH`）。
6. 部署 Worker。

## 使用说明

### 上传图片

1. 访问上传页面（默认为 `/upload`）
2. 通过以下方式上传图片：
   - 拖拽文件到上传区域
   - 点击选择文件
   - 使用 Ctrl+V 粘贴图片

### 查看图片

- 访问 `/images` 查看所有图片
- 访问 `/images/[子目录]` 查看特定目录的图片
- 访问 `/carousel` 查看图片轮播展示
- 访问 `/carousel/[子目录]` 查看特定目录的图片轮播展示

### 轮播功能说明

轮播页面支持以下特性：
- 自动轮播（每5秒切换一次图片）
- 支持子目录浏览
- 全屏展示
- 自适应屏幕大小
- 图片居中显示
- 黑色背景优化显示效果

使用示例：
- 访问 `/carousel` 查看根目录图片轮播
- 访问 `/carousel/photos` 查看 photos 子目录的图片轮播
- 访问 `/carousel/2024/01` 查看多级子目录的图片轮播

### API 接口

#### 上传图片
```
POST /upload
Content-Type: multipart/form-data

参数：
- file: 图片文件（支持多文件）
```

#### 获取图片列表
```
GET /images
GET /images/[子目录]
```

## 配置参数

在 `worker.js` 中可以修改以下配置：

```javascript
const CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 最大文件大小（10MB）
    MAX_CONCURRENT_UPLOADS: 5, // 最大并发上传数
    CACHE_DURATION: 86400, // 缓存时间（1天）
    RATE_LIMIT: {
        windowMs: 60 * 1000, // 限流时间窗口（1分钟）
        max: 100, // 最大请求数
        blockDuration: 300 // 封禁时间（秒）
    }
    // ... 其他配置
};
```

## 注意事项

1. 文件大小限制为 10MB
2. 支持的文件格式：JPEG、PNG、GIF、TIFF、BMP、ICO、PSD、WebP、SVG
3. 建议定期清理不需要的图片
4. 请确保 WebDAV 服务器有足够的存储空间

## 常见问题

1. 上传失败
   - 检查文件大小是否超过限制
   - 确认文件格式是否支持
   - 验证 WebDAV 服务器连接是否正常

2. 图片无法显示
   - 检查图片链接是否正确
   - 确认图片格式是否被浏览器支持
   - 验证 WebDAV 服务器访问权限

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进项目。

## 许可证

MIT License
