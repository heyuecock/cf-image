# Cloudflare Workers 图床服务

这是一个基于 Cloudflare Workers 和 WebDAV 的简单图床服务。支持图片上传、预览和分享功能。

## 功能特点

- 🚀 基于 Cloudflare Workers 部署，全球 CDN 加速
- 📤 支持拖拽上传、点击上传和剪贴板上传
- 🔒 支持 WebDAV 存储，确保数据安全
- 🎨 美观的 UI 界面，支持响应式设计
- 📱 支持移动端访问
- 🔗 一键复制图片链接

## 部署步骤

### 1. 准备工作

1. 注册 [Cloudflare](https://dash.cloudflare.com/sign-up) 账号
2. 准备一个可用的 WebDAV 服务器（如：坚果云、阿里云 OSS 等）

### 2. 创建 Worker

1. 登录 Cloudflare 控制台
2. 进入 "Workers & Pages" 页面
3. 点击 "创建应用程序"
4. 选择 "创建 Worker"
5. 将 `worker.js` 的代码复制到编辑器中

### 3. 配置环境变量

在 Worker 的 "设置" -> "环境变量" 中添加以下变量：

- `WEBDAV_URL`: WebDAV 服务器地址（例如：`https://dav.jianguoyun.com/dav`）
- `WEBDAV_USERNAME`: WebDAV 用户名
- `WEBDAV_PASSWORD`: WebDAV 密码
- `UPLOAD_PAGE_PATH`: 上传页面路径（例如：`upload`，不需要加斜杠）

### 4. 部署

1. 点击 "保存并部署"
2. 等待部署完成
3. 记录下您的 Worker 域名（例如：`your-worker.your-subdomain.workers.dev`）

### 5. 访问

通过以下地址访问您的图床：
```
https://your-worker.your-subdomain.workers.dev/UPLOAD_PAGE_PATH
```

## 使用说明

1. 打开上传页面
2. 通过以下方式上传图片：
   - 拖拽图片到上传区域
   - 点击选择文件按钮
   - 使用 Ctrl+V 粘贴剪贴板中的图片
3. 上传成功后，点击"复制链接"按钮获取图片链接

## 注意事项

1. 确保 WebDAV 服务器支持 CORS
2. 建议定期备份 WebDAV 中的图片数据
3. 如需自定义域名，请在 Cloudflare 中配置自定义域名

## 安全建议

1. 定期更换 WebDAV 密码
2. 使用 HTTPS 协议访问 WebDAV
3. 建议设置 WebDAV 存储空间限制
4. 定期检查上传的图片内容

## 常见问题

1. **上传失败**
   - 检查 WebDAV 服务器是否可访问
   - 确认环境变量配置是否正确
   - 检查网络连接是否正常

2. **图片无法显示**
   - 确认图片链接是否正确
   - 检查 WebDAV 服务器是否支持图片访问
   - 清除浏览器缓存后重试

## 技术支持

如有问题，请提交 Issue 或联系开发者。

## 许可证

MIT License 
