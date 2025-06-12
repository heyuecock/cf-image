// 使用 Cloudflare Workers 的模块系统
export default {
    async fetch(request, env, ctx) {
        try {
            // 添加请求限流
            const rateLimitResult = await rateLimit(request);
            if (rateLimitResult) return rateLimitResult;

            const WEBDAV_URL = env.WEBDAV_URL;
            const WEBDAV_USERNAME = env.WEBDAV_USERNAME;
            const WEBDAV_PASSWORD = env.WEBDAV_PASSWORD;
            const UPLOAD_PAGE_PATH = '/' + (env.UPLOAD_PAGE_PATH || 'upload').replace(/^\/+/g, '');
            const url = new URL(request.url);
            const path = url.pathname;

            // 添加 CORS 头
            const corsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            };

            // 处理 OPTIONS 请求
            if (request.method === 'OPTIONS') {
                return new Response(null, {
                    status: 204,
                    headers: corsHeaders
                });
            }

            // 1. 根路径重定向
            if (path === '/' && UPLOAD_PAGE_PATH !== '/') {
                return Response.redirect('https://www.bing.com', 302);
            }

            // 2. 上传接口
            if (path === '/upload' && request.method === 'POST') {
                const response = await handleUpload(request, webdavClient(WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD), url);
                response.headers.set('Access-Control-Allow-Origin', '*');
                return response;
            }

            // 3. 获取图片列表接口 (支持子目录)
            const imageListMatch = path.match(/^\/images(?:\/(.*))?$/);
            if (imageListMatch && request.method === 'GET') {
                const subPath = imageListMatch[1] || '';
                const response = await handleGetImages(request, webdavClient(WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD), url, subPath);
                response.headers.set('Access-Control-Allow-Origin', '*');
                return response;
            }

            // 4. 轮播页面 (支持子目录)
            const carouselMatch = path.match(/^\/carousel(?:\/(.*))?$/);
            if (carouselMatch) {
                const subPath = carouselMatch[1] || '';
                return serveStaticFile('carousel.html', subPath);
            }

            // 5. 静态资源
            if (isStaticFile(path, UPLOAD_PAGE_PATH)) {
                const filename = getStaticFilename(path, UPLOAD_PAGE_PATH);
                return serveStaticFile(filename);
            }

            // 6. 图片访问 (支持子目录)
            if (request.method === 'GET') {
                const fullImagePath = path.startsWith('/') ? path.substring(1) : path;
                if (isImageFile(fullImagePath)) {
                    return handleGetImage(request, webdavClient(WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD), ctx, fullImagePath);
                }
            }

            return handleError(new Error('Not Found'), 'route');
        } catch (error) {
            return handleError(error, 'main');
        }
    }
};

// WebDAV 客户端工厂
function webdavClient(url, username, password) {
    // 确保 url 末尾没有斜杠
    const baseUrl = url.replace(/\/+$/, '');
    return {
        baseUrl,
        username,
        password,
        async putFileContents(filename, buffer) {
            const res = await fetch(`${baseUrl}/${filename}`, {
                method: 'PUT',
                headers: {
                    'Authorization': 'Basic ' + btoa(`${username}:${password}`),
                    'Content-Type': 'application/octet-stream'
                },
                body: buffer
            });
            if (!res.ok) throw new Error('WebDAV 上传失败');
        },
        async getFileContents(filename) {
            const res = await fetch(`${baseUrl}/${filename}`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Basic ' + btoa(`${username}:${password}`)
                }
            });
            if (!res.ok) throw new Error('WebDAV 获取文件失败');
            return res;
        }
    };
}

// 6. 优化配置
const CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_CONCURRENT_UPLOADS: 5,
    CACHE_DURATION: 86400, // 1天
    RATE_LIMIT: {
        windowMs: 60 * 1000, // 1分钟
        max: 100, // 最大请求数
        blockDuration: 300 // 封禁时间（秒）
    },
    ALLOWED_IMAGE_TYPES: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/tiff',
        'image/bmp',
        'image/x-icon',
        'image/vnd.adobe.photoshop',
        'image/webp',
        'image/svg+xml'
    ],
    CACHE_PREFIX: {
        RATE_LIMIT: 'rate_limit:',
        IMAGE_LIST: 'image_list:',
        IMAGE: 'image:'
    },
    SECURITY: {
        ALLOWED_ORIGINS: ['*'],
        MAX_FILES_PER_REQUEST: 10,
        FILENAME_PATTERN: /^[a-zA-Z0-9-_]+\.(jpg|jpeg|png|gif|tif|tiff|bmp|ico|psd|webp|svg)$/
    }
};

// 1. 优化内存缓存实现
class MemoryCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 1000; // 添加最大缓存条目限制
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (item.expires < Date.now()) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }

    set(key, value, ttl) {
        // 添加缓存大小限制
        if (this.cache.size >= this.maxSize) {
            this.cleanup();
        }
        this.cache.set(key, {
            value,
            expires: Date.now() + ttl
        });
    }

    delete(key) {
        this.cache.delete(key);
    }

    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (item.expires < now) {
                this.cache.delete(key);
            }
        }
    }
}

const memoryCache = new MemoryCache();

// 优化的请求限流中间件
async function rateLimit(request) {
    try {
        // 清理过期缓存
        memoryCache.cleanup();

        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const key = CONFIG.CACHE_PREFIX.RATE_LIMIT + ip;
        
        const current = memoryCache.get(key) || { count: 0 };
        current.count++;
        
        if (current.count > CONFIG.RATE_LIMIT.max) {
            return new Response(JSON.stringify({
                success: false,
                message: '请求过于频繁，请稍后再试'
            }), { 
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        
        memoryCache.set(key, current, CONFIG.RATE_LIMIT.windowMs);
        return null;
    } catch (error) {
        console.error('Rate limit error:', error);
        return null;
    }
}

// 2. 增强错误处理
function handleError(error, context = '') {
    const errorMessage = error.message || '未知错误';
    const errorCode = error.code || 'UNKNOWN_ERROR';
    console.error(`[${context}] Error:`, error);
    
    return new Response(JSON.stringify({
        success: false,
        message: `操作失败: ${errorMessage}`,
        code: errorCode,
        context: context,
        timestamp: new Date().toISOString()
    }), { 
        status: error.status || 500,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
        }
    });
}

// 3. 增强文件验证
function validateFile(file) {
    const errors = [];
    
    if (!file.type.startsWith('image/')) {
        errors.push('不支持的文件类型');
    }
    
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        errors.push(`文件大小超过限制 (最大 ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }
    
    // 添加文件类型白名单验证
    if (!CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
        errors.push('不支持的文件格式');
    }
    
    if (errors.length > 0) {
        throw new Error(errors.join(', '));
    }
    
    return true;
}

// 4. 优化上传处理
async function handleUpload(request, webdav, currentUrl) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('file');
        
        if (!files || files.length === 0) {
            return handleError(new Error('未选择文件'), 'upload');
        }

        const results = [];
        const uploadPromises = [];
        const errors = [];
        
        for (const file of files) {
            try {
                validateFile(file);
                
                const buffer = await file.arrayBuffer();
                const timestamp = Date.now().toString().slice(-6);
                const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
                const ext = file.name.split('.').pop().toLowerCase();
                const filename = `${timestamp}${random}.${ext}`;

                const uploadPromise = webdav.putFileContents(filename, buffer)
                    .then(() => ({
                        originalName: file.name,
                        url: `${currentUrl.origin}/${filename}`,
                        size: file.size,
                        type: file.type,
                        filename: filename
                    }))
                    .catch(error => {
                        errors.push(`文件 ${file.name} 上传失败: ${error.message}`);
                        return null;
                    });

                uploadPromises.push(uploadPromise);
                
                if (uploadPromises.length >= CONFIG.MAX_CONCURRENT_UPLOADS) {
                    const completed = await Promise.all(uploadPromises);
                    results.push(...completed.filter(Boolean));
                    uploadPromises.length = 0;
                }
            } catch (error) {
                errors.push(`文件 ${file.name} 处理失败: ${error.message}`);
            }
        }

        if (uploadPromises.length > 0) {
            const completed = await Promise.all(uploadPromises);
            results.push(...completed.filter(Boolean));
        }

        if (results.length === 0) {
            return handleError(new Error('没有有效的图片文件'), 'upload');
        }

        // 清除图片列表缓存
        memoryCache.delete(CONFIG.CACHE_PREFIX.IMAGE_LIST);

        return new Response(JSON.stringify({
            success: true,
            files: results,
            errors: errors.length > 0 ? errors : undefined
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        return handleError(error, 'upload');
    }
}

// 5. 优化图片获取处理
async function handleGetImage(request, webdav, ctx, fullImagePath) {
    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    
    try {
        let response = await cache.match(cacheKey);
        if (response) {
            return response;
        }

        const upstream = await webdav.getFileContents(fullImagePath);
        const headers = new Headers();
        headers.set('Content-Type', getContentType(fullImagePath));
        
        response = new Response(upstream.body, {
            status: 200,
            headers
        });

        // 优化缓存策略
        headers.set('Cache-Control', `public, max-age=${CONFIG.CACHE_DURATION}, stale-while-revalidate=${CONFIG.CACHE_DURATION * 2}`);
        headers.set('Expires', new Date(Date.now() + CONFIG.CACHE_DURATION * 1000).toUTCString());
        headers.set('ETag', `"${fullImagePath}-${Date.now()}"`);
        headers.set('Vary', 'Accept-Encoding');
        
        // 异步缓存
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        
        return response;
    } catch (error) {
        return handleError(error, 'getImage');
    }
}

// 优化的图片列表获取
async function handleGetImages(request, webdav, currentUrl, subPath = '') {
    try {
        const cacheKey = CONFIG.CACHE_PREFIX.IMAGE_LIST + (subPath || 'root');
        const cachedData = memoryCache.get(cacheKey);
        
        if (cachedData) {
            return new Response(JSON.stringify(cachedData), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        const webdavPath = subPath ? `${webdav.baseUrl}/${subPath}` : webdav.baseUrl;
        const res = await fetch(webdavPath, {
            method: 'PROPFIND',
            headers: {
                'Authorization': 'Basic ' + btoa(`${webdav.username}:${webdav.password}`),
                'Depth': '1'
            }
        });

        if (!res.ok) {
            throw new Error(`获取图片列表失败: ${res.status}`);
        }

        const text = await res.text();
        const hrefs = Array.from(text.matchAll(/<d:href>([^<]+)<\/d:href>/gi))
            .map(m => decodeURIComponent(m[1]))
            .filter(href => href && !href.endsWith('/'));

        const files = hrefs
            .map(href => {
                const name = href.split('/').pop();
                return name ? name.replace(/^\/+|\/+$/g, '') : '';
            })
            .filter(name => name && isImageFile(name))
            .map(name => ({
                url: subPath ? `${currentUrl.origin}/${subPath}/${name}` : `${currentUrl.origin}/${name}`,
                name: name
            }));

        const responseData = {
            success: true,
            files: files
        };

        // 缓存结果
        memoryCache.set(cacheKey, responseData, CONFIG.CACHE_DURATION * 1000);

        return new Response(JSON.stringify(responseData), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        return handleError(error, 'getImages');
    }
}

// 静态资源判断
function isStaticFile(path, uploadPagePath) {
    return [
        '/app.js',
        '/styles.css',
        '/favicon.ico',
        '/robots.txt',
        // 确保 /carousel 页面被识别为静态文件
        '/carousel'
    ].includes(path) || path === uploadPagePath || path === uploadPagePath + '.html' || path === '/index.html' || path === '/';
}

// 静态资源文件名映射
function getStaticFilename(path, uploadPagePath) {
    if (path === uploadPagePath || path === uploadPagePath + '.html' || path === '/' || path === '/index.html') return 'index.html';
    if (path === '/app.js') return 'app.js';
    if (path === '/styles.css') return 'styles.css';
    if (path === '/carousel') return 'carousel.html'; // 新增路由
    return path.replace(/^ /, '');
}

// 图片类型判断
function isImageFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'bmp', 'ico', 'psd', 'webp', 'svg'].includes(ext);
}

// 内容类型推断
function getContentType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        'html': 'text/html',
        'js': 'application/javascript',
        'css': 'text/css',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'tif': 'image/tiff',
        'tiff': 'image/tiff',
        'bmp': 'image/bmp',
        'ico': 'image/x-icon',
        'psd': 'image/vnd.adobe.photoshop',
        'svg': 'image/svg+xml',
        'txt': 'text/plain'
    };
    return types[ext] || 'application/octet-stream';
}

// 静态文件内容
const staticFiles = {
    'index.html': `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>图片上传</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-gray-100 min-h-screen flex items-start justify-center pt-16">
    <div class="container mx-auto px-4 py-8">
        <div class="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-8">
            <h1 class="text-3xl font-bold text-center mb-8">图片上传</h1>
            <div id="dropZone" class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors bg-gray-50">
                <div class="space-y-4">
                    <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7m-4 0V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2m5 5v6m-3-3h6"></path></svg>
                    <p class="text-lg text-gray-600">拖拽文件到这里, 或点击选择文件</p>
                    <p class="text-sm text-gray-500">支持多文件上传，您也可以使用 <kbd>Ctrl+V</kbd> 从剪贴板粘贴</p>
                </div>
                <input type="file" id="fileInput" class="hidden" accept="image/*" multiple />
            </div>
            <button id="selectFileButton" class="w-full bg-blue-500 text-white py-2.5 px-4 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 mt-6 text-lg font-semibold shadow-sm transition">选择文件</button>
            
            <!-- 上传进度区域 -->
            <div id="uploadProgress" class="mt-8 hidden">
                <div class="bg-white rounded-xl shadow p-6 border border-gray-100">
                    <div class="text-center mb-4 font-semibold text-blue-600 text-base tracking-wide">正在上传...</div>
                    <div class="space-y-4 upload-progress-list"></div>
                </div>
            </div>

            <!-- 上传结果区域 -->
            <div id="uploadResult" class="mt-8 hidden">
                <div id="successMessage" class="bg-green-50 text-green-700 p-2 rounded-lg mb-6 text-center border border-green-200 shadow-sm">文件上传成功！</div>
                <div id="fileList" class="space-y-6"></div>
            </div>

            <div id="errorMessage" class="mt-8 hidden bg-red-50 text-red-700 p-3 rounded-lg text-center border border-red-200 shadow-sm">上传失败，请重试</div>
        </div>
    </div>
    <script src="app.js"></script>
</body>
</html>`,
    'app.js': `document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectFileButton = document.getElementById('selectFileButton');
    const uploadResult = document.getElementById('uploadResult');
    const successMessage = document.getElementById('successMessage');
    const fileList = document.getElementById('fileList');
    const errorMessage = document.getElementById('errorMessage');
    const uploadProgress = document.getElementById('uploadProgress');
    const progressContainer = uploadProgress.querySelector('.upload-progress-list');

    let isUploading = false;

    function hideAllMessages() {
        uploadResult.classList.add('hidden');
        errorMessage.classList.add('hidden');
        uploadProgress.classList.add('hidden');
    }

    function createProgressBar(filename) {
        const div = document.createElement('div');
        div.className = 'flex flex-col items-start';
        div.innerHTML =
            '<div class="text-xs text-gray-500 mb-1 font-medium">' + filename + '</div>' +
            '<div class="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">' +
            '<div class="bg-blue-500 h-2.5 rounded-full upload-anim-bar" style="width: 0%; transition: width 0.4s cubic-bezier(.4,2,.6,1);"></div>' +
            '</div>';
        return div;
    }

    function updateProgressBar(progressBar, percent) {
        const bar = progressBar.querySelector('.upload-anim-bar');
        bar.style.width = percent + '%';
    }

    function createFileItem(file) {
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded-xl shadow flex items-center justify-between border border-gray-100 hover:shadow-md transition';
        div.innerHTML = '<div class="flex-1 min-w-0">' +
            '<div class="text-sm text-gray-700 font-medium truncate">' + file.originalName + '</div>' +
            '<div class="text-xs text-gray-400 mt-1">' + (file.size / 1024).toFixed(1) + ' KB</div>' +
            '</div>' +
            '<div class="flex items-center space-x-2 ml-4 min-w-0">' +
            '<input type="text" value="' + file.url + '" class="file-url-input flex-grow rounded-md border border-gray-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm bg-gray-50 truncate transition" readonly title="' + file.url + '" />' +
            '<button class="copy-button bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-semibold transition">复制链接</button>' +
            '</div>';
        return div;
    }

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-blue-500');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-blue-500');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500');
        const files = e.dataTransfer.files;
        if (files.length > 0 && !isUploading) {
            handleFiles(files);
        }
    });

    selectFileButton.addEventListener('click', () => {
        if (!isUploading) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0 && !isUploading) {
            handleFiles(e.target.files);
        }
    });

    document.addEventListener('paste', (e) => {
        if (isUploading) return;
        const items = e.clipboardData.items;
        const files = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    files.push(file);
                }
            }
        }
        if (files.length > 0) {
            handleFiles(files);
        }
    });

    async function handleFiles(files) {
        if (isUploading) return;
        isUploading = true;
        
        hideAllMessages();
        uploadProgress.classList.remove('hidden');
        progressContainer.innerHTML = '';
        
        const formData = new FormData();
        const progressBars = new Map();
        
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            formData.append('file', file);
            const progressBar = createProgressBar(file.name);
            progressContainer.appendChild(progressBar);
            progressBars.set(file.name, progressBar);
        }

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error('上传失败: ' + response.status + ' ' + errorText);
            }

            const data = await response.json();
            if (data.success) {
                fileList.innerHTML = '';
                data.files.forEach(file => {
                    const fileItem = createFileItem(file);
                    fileList.appendChild(fileItem);
                });
                uploadResult.classList.remove('hidden');
            } else {
                throw new Error('上传失败');
            }
        } catch (error) {
            errorMessage.textContent = '上传失败，请重试: ' + error.message;
            errorMessage.classList.remove('hidden');
        } finally {
            uploadProgress.classList.add('hidden');
            isUploading = false;
        }
    }

    // 复制链接功能
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('copy-button')) {
            const input = e.target.previousElementSibling;
            input.select();
            input.setSelectionRange(0, 99999);
            try {
                document.execCommand('copy');
                e.target.textContent = '已复制';
                setTimeout(() => {
                    e.target.textContent = '复制链接';
                }, 2000);
            } catch (err) {
                alert('复制链接失败，请手动复制。');
            }
        }
    });

    // 鼠标悬浮自动全选链接
    document.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('file-url-input')) {
            e.target.select();
        }
    });

    dropZone.addEventListener('click', () => {
        if (!isUploading) {
            fileInput.click();
        }
    });
});`,
    'styles.css': `/* 自定义样式 */
.border-dashed {
    border-style: dashed;
}
#dropZone:hover {
    border-color: #3b82f6;
    background-color: #f8fafc;
}
#preview img {
    transition: transform 0.2s;
}
#preview img:hover {
    transform: scale(1.02);
}
button:hover {
    filter: brightness(90%);
}
.file-url-input {
    max-width: 220px;
    min-width: 120px;
    cursor: pointer;
}
.copy-button {
    min-width: 90px;
    height: 40px;
    box-shadow: 0 1px 2px rgba(59,130,246,0.08);
}
.copy-button:hover {
    box-shadow: 0 4px 12px rgba(59,130,246,0.15);
}
.upload-anim-bar {
    transition: width 0.4s cubic-bezier(.4,2,.6,1);
}
#uploadProgress .bg-white {
    box-shadow: 0 2px 16px 0 rgba(59,130,246,0.07);
}
#carousel {
    transition: all 0.3s ease;
}
#carousel img {
    transition: opacity 0.3s ease;
}
#carousel button {
    opacity: 0.7;
    transition: opacity 0.3s ease;
}
#carousel button:hover {
    opacity: 1;
}
@media (max-width: 640px) {
    .container {
        padding-left: 1rem;
        padding-right: 1rem;
    }
    #preview {
        grid-template-columns: 1fr;
    }
    .file-url-input {
        max-width: 100px;
    }
    #carousel {
        height: 60vh;
    }
}`,
    'carousel.html': `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>图片轮播</title>
    <style>
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            background: #111;
        }
        body {
            width: 100vw;
            height: 100vh;
            overflow: hidden;
        }
        #carousel {
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #111;
        }
        #carousel img {
            max-width: 100vw;
            max-height: 100vh;
            object-fit: contain;
            display: block;
            margin: 0 auto;
            background: #111;
        }
    </style>
</head>
<body>
    <div id="carousel">
        <img id="currentImage" src="" alt="" />
    </div>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            let images = [];
            let currentImageIndex = 0;
            let autoPlayInterval = null;
            const AUTO_PLAY_INTERVAL = 5000; // 5秒切换一次
            const currentImage = document.getElementById('currentImage');

            // 从 URL 获取 subPath 参数
            const urlParams = new URLSearchParams(window.location.search);
            const subPath = urlParams.get('path') || '';
            const imageUrlApi = subPath ? \`/images/\${subPath}\` : '/images';

            async function initCarousel() {
                try {
                    const response = await fetch(imageUrlApi);
                    const data = await response.json();
                    if (data.success) {
                        images = data.files;
                        if (images.length > 0) {
                            showImage(0);
                            startAutoPlay();
                        }
                    }
                } catch (error) {
                    console.error('轮播初始化失败:', error);
                }
            }

            function showImage(index) {
                if (images.length === 0) return;
                currentImageIndex = (index + images.length) % images.length;
                currentImage.src = images[currentImageIndex].url;
            }

            function startAutoPlay() {
                if (autoPlayInterval) clearInterval(autoPlayInterval);
                autoPlayInterval = setInterval(() => {
                    showImage(currentImageIndex + 1);
                }, AUTO_PLAY_INTERVAL);
            }

            initCarousel();
        });
    </script>
</body>
</html>`
};

async function serveStaticFile(filename, subPath = '') {
    const content = staticFiles[filename];
    if (!content) return new Response('File not found', { status: 404 });
    
    // 如果是轮播页面，注入子目录参数
    if (filename === 'carousel.html' && subPath) {
        const modifiedContent = content.replace(
            'const subPath = urlParams.get(\'path\') || \'\';',
            `const subPath = '${subPath}';`
        );
        return new Response(modifiedContent, { 
            headers: { 
                'Content-Type': getContentType(filename),
                'Cache-Control': 'no-store'
            } 
        });
    }
    
    return new Response(content, { 
        headers: { 
            'Content-Type': getContentType(filename),
            'Cache-Control': 'no-store'
        } 
    });
}
