// 使用 Cloudflare Workers 的模块系统
export default {
    async fetch(request, env, ctx) {
        const WEBDAV_URL = env.WEBDAV_URL;
        const WEBDAV_USERNAME = env.WEBDAV_USERNAME;
        const WEBDAV_PASSWORD = env.WEBDAV_PASSWORD;
        // 确保 UPLOAD_PAGE_PATH 始终以 '/' 开头，并移除多余的 '/'
        const UPLOAD_PAGE_PATH = '/' + (env.UPLOAD_PAGE_PATH || 'upload').replace(/^\/+/g, '');
        // console.log('UPLOAD_PAGE_PATH:', UPLOAD_PAGE_PATH);
        const url = new URL(request.url);
        const path = url.pathname;
        // console.log('path:', path);

        // 1. 根路径重定向
        if (path === '/' && UPLOAD_PAGE_PATH !== '/') {
            return Response.redirect('https://www.bing.com', 302);
        }

        // 2. 上传接口
        if (path === '/upload' && request.method === 'POST') {
            return handleUpload(request, webdavClient(WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD), url);
        }

        // 3. 静态资源
        if (isStaticFile(path, UPLOAD_PAGE_PATH)) {
            const filename = getStaticFilename(path, UPLOAD_PAGE_PATH);
            return serveStaticFile(filename);
        }

        // 4. 图片访问
        if (isImageFile(path.substring(1)) && request.method === 'GET') {
            return handleGetImage(request, webdavClient(WEBDAV_URL, WEBDAV_USERNAME, WEBDAV_PASSWORD), ctx);
        }

        return new Response('Not Found', { status: 404 });
    }
};

// WebDAV 客户端工厂
function webdavClient(url, username, password) {
    // 确保 url 末尾没有斜杠
    const baseUrl = url.replace(/\/+$/, '');
    return {
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

// 上传处理
async function handleUpload(request, webdav, currentUrl) {
    try {
    const formData = await request.formData();
    const file = formData.get('file');
        if (!file) return new Response('未选择文件', { status: 400 });
        if (!file.type.startsWith('image/')) return new Response('请上传图片文件', { status: 400 });
        const buffer = await file.arrayBuffer();
        const filename = `${Date.now()}-${file.name}`;
        await webdav.putFileContents(filename, buffer);
        const fileUrl = `${currentUrl.origin}/${filename}`;
        return new Response(JSON.stringify({ url: fileUrl }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response('上传失败: ' + e.message, { status: 500 });
    }
}

// 图片获取处理
async function handleGetImage(request, webdav, ctx) {
    const filename = request.url.split('/').pop();
    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    let response = await cache.match(cacheKey);
    if (response) return response;
    try {
        const upstream = await webdav.getFileContents(filename);
        const headers = new Headers();
        headers.set('Content-Type', getContentType(filename));
        response = new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers
        });
        response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
    } catch (e) {
        return new Response('图片获取失败: ' + e.message, { status: 500 });
    }
}

// 静态资源判断
function isStaticFile(path, uploadPagePath) {
    console.log('isStaticFile called with path:', path, 'uploadPagePath:', uploadPagePath);
    return [
        '/app.js',
        '/styles.css',
        '/favicon.ico',
        '/robots.txt'
    ].includes(path) || path === uploadPagePath || path === uploadPagePath + '.html' || path === '/index.html' || path === '/';
}

// 静态资源文件名映射
function getStaticFilename(path, uploadPagePath) {
    console.log('getStaticFilename called with path:', path, 'uploadPagePath:', uploadPagePath);
    if (path === uploadPagePath || path === uploadPagePath + '.html' || path === '/' || path === '/index.html') return 'index.html';
    if (path === '/app.js') return 'app.js';
    if (path === '/styles.css') return 'styles.css';
    return path.replace(/^ /, '');
}

// 图片类型判断
function isImageFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
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
        'ico': 'image/x-icon',
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
    <title>文件上传</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-gray-100 min-h-screen flex items-start justify-center pt-16">
    <div class="container mx-auto px-4 py-8">
        <div class="max-w-xl mx-auto bg-white rounded-lg shadow-md p-8">
            <h1 class="text-3xl font-bold text-center mb-8">文件上传!</h1>
            <div id="dropZone" class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors">
                <div class="space-y-4">
                    <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7m-4 0V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2m5 5v6m-3-3h6"></path></svg>
                    <p class="text-lg text-gray-600">拖拽文件到这里, 或点击选择文件</p>
                    <p class="text-sm text-gray-500">您也可以使用 <kbd>Ctrl+V</kbd> 从剪贴板粘贴</p>
                </div>
                <input type="file" id="fileInput" class="hidden" accept="image/*">
            </div>
            <button id="selectFileButton" class="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 mt-4">选择文件</button>
            <div id="uploadResult" class="mt-8 hidden">
                <div id="successMessage" class="bg-green-100 text-green-700 p-3 rounded-md mb-4 text-center">文件上传成功!</div>
                <label class="block text-sm font-medium text-gray-700 mb-2">上传成功!</label>
                <div class="flex items-center">
                    <input type="text" id="imageUrl" class="flex-grow rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2" readonly>
                    <button id="copyButton" class="ml-2 bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">复制链接</button>
                </div>
            </div>
            <div id="loadingMessage" class="mt-8 hidden bg-blue-100 text-blue-700 p-3 rounded-md text-center">上传中... 请稍候</div>
            <div id="errorMessage" class="mt-8 hidden bg-red-100 text-red-700 p-3 rounded-md text-center">上传失败，请重试</div>
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
    const imageUrlInput = document.getElementById('imageUrl');
    const copyButton = document.getElementById('copyButton');
    const errorMessage = document.getElementById('errorMessage');
    const loadingMessage = document.getElementById('loadingMessage');
    function hideAllMessages() {
        uploadResult.classList.add('hidden');
        errorMessage.classList.add('hidden');
        loadingMessage.classList.add('hidden');
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
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
    selectFileButton.addEventListener('click', () => {
        fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    handleFile(file);
                    break;
                }
            }
        }
    });
    async function handleFile(file) {
        hideAllMessages();
        loadingMessage.classList.remove('hidden');
        if (!file.type.startsWith('image/')) {
            errorMessage.textContent = '请上传图片文件。';
            errorMessage.classList.remove('hidden');
            loadingMessage.classList.add('hidden');
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
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
            imageUrlInput.value = data.url;
            uploadResult.classList.remove('hidden');
        } catch (error) {
            console.error('上传错误:', error);
            errorMessage.textContent = '上传失败，请重试: ' + error.message;
            errorMessage.classList.remove('hidden');
        } finally {
            loadingMessage.classList.add('hidden');
        }
    }
    copyButton.addEventListener('click', () => {
        imageUrlInput.select();
        imageUrlInput.setSelectionRange(0, 99999);
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('复制失败:', err);
            alert('复制链接失败，请手动复制。');
        }
    });
    dropZone.addEventListener('click', () => {
        fileInput.click();
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
@media (max-width: 640px) {
    .container {
        padding-left: 1rem;
        padding-right: 1rem;
    }
    #preview {
        grid-template-columns: 1fr;
    }
    }
`
};

async function serveStaticFile(filename) {
    console.log('serveStaticFile called with filename:', filename);
    const content = staticFiles[filename];
    if (!content) return new Response('File not found', { status: 404 });
    return new Response(content, { headers: { 'Content-Type': getContentType(filename) } });
} 
