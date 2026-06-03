# 前端性能优化工具库

## 概述

这是一个为 Cloudflare Workers 项目设计的前端性能优化工具库，包含懒加载、防抖节流、性能监控、骨架屏渲染、资源预加载和 PWA 支持等功能。

## 功能列表

### 1. 懒加载 (LazyLoader)

自动延迟加载图片和元素，提升首屏加载速度。

```typescript
import { LazyLoader } from './frontendOptimizer';

// 创建实例
const loader = new LazyLoader({
  rootMargin: '50px',
  threshold: 0.1,
  loadingClass: 'lazy-loading',
  loadedClass: 'lazy-loaded'
});

// 懒加载所有带 data-src 属性的图片
loader.observeImages();

// 或观察单个元素
loader.observeElement(document.getElementById('target'), () => {
  // 加载内容
  loadHeavyContent();
});
```

**HTML 使用方式**：
```html
<img data-src="/path/to/image.jpg" alt="Lazy loaded image">
```

### 2. 防抖和节流 (debounce, throttle)

控制函数执行频率，避免频繁调用。

```typescript
import { debounce, throttle } from './frontendOptimizer';

// 防抖 - 最后一次调用后等待指定时间执行
const debouncedSearch = debounce((query) => {
  performSearch(query);
}, 300);

// 节流 - 每隔指定时间执行一次
const throttledScroll = throttle(() => {
  handleScroll();
}, 100);

// 使用
input.addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
});

window.addEventListener('scroll', throttledScroll);
```

### 3. 性能监控 (PerformanceMonitor)

监控和上报页面性能指标。

```typescript
import { performanceMonitor } from './frontendOptimizer';

// 记录性能标记
performanceMonitor.mark('operation-start');

// 执行操作
await performHeavyOperation();

// 测量性能
const duration = performanceMonitor.measure('heavy-operation', 'operation-start');

// 获取性能指标
const metrics = performanceMonitor.getMetrics();
// { fcp: 100, lcp: 200, fid: 10, ttfb: 50 }

// 上报性能数据
performanceMonitor.report('/api/metrics');
```

**性能指标说明**：
- **FCP** (First Contentful Paint): 首次内容绘制
- **LCP** (Largest Contentful Paint): 最大内容绘制
- **FID** (First Input Delay): 首次输入延迟
- **TTFB** (Time To First Byte): 首字节时间

### 4. 骨架屏 (SkeletonRenderer)

显示加载占位符，提升用户体验。

```typescript
import { SkeletonRenderer, createSkeletonHtml } from './frontendOptimizer';

const container = document.getElementById('content');

// 创建骨架屏
const skeleton = new SkeletonRenderer(
  container,
  createSkeletonHtml({ type: 'card', count: 3 })
);

// 显示骨架屏
skeleton.show();
skeleton.startAnimation();

// 加载完成后隐藏
await loadContent();
skeleton.hide();
```

**骨架屏类型**：
- `card`: 卡片骨架屏
- `list`: 列表骨架屏
- `form`: 表单骨架屏
- `table`: 表格骨架屏

### 5. 资源预加载 (ResourcePreloader)

提前加载关键资源，减少等待时间。

```typescript
import { resourcePreloader } from './frontendOptimizer';

// 预加载单张图片
await resourcePreloader.preloadImage('/images/hero.jpg');

// 预加载多张图片
await resourcePreloader.preloadImages([
  '/images/logo.png',
  '/images/banner.jpg',
  '/images/icon.png'
]);

// 预加载脚本
await resourcePreloader.preloadScript('/js/app.js');

// 预加载样式
await resourcePreloader.preloadStylesheet('/css/main.css');
```

### 6. PWA 安装提示 (PWAInstallPrompt)

支持 PWA 应用安装。

```typescript
import { pwaInstallPrompt } from './frontendOptimizer';

// 检查是否可以安装
if (pwaInstallPrompt?.canInstall()) {
  // 显示安装提示 UI
  showInstallButton();
}

// 用户点击安装按钮时
async function installPWA() {
  const success = await pwaInstallPrompt?.install();
  if (success) {
    console.log('PWA 安装成功');
  }
}
```

## 样式文件

引入优化相关的 CSS 样式：

```html
<link rel="stylesheet" href="/styles/optimization.css">
```

### 包含的样式

1. **懒加载动画**：淡入效果
2. **骨架屏组件**：多种预设样式
3. **性能指标显示**：右下角调试面板
4. **加载指示器**：旋转动画
5. **PWA 安装提示**：底部弹出框
6. **暗黑模式支持**：自动适配

## 使用示例

### 完整示例

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>性能优化示例</title>
  <link rel="stylesheet" href="/styles/optimization.css">
</head>
<body>
  <div id="content">
    <!-- 骨架屏占位 -->
  </div>

  <div id="install-prompt" class="pwa-install-prompt" style="display: none;">
    <h3>安装应用</h3>
    <p>添加到主屏幕以获得更好的体验</p>
    <div class="buttons">
      <button class="btn btn-primary" id="install-btn">安装</button>
      <button class="btn btn-secondary" id="dismiss-btn">稍后</button>
    </div>
  </div>

  <script type="module">
    import { 
      lazyLoader, 
      performanceMonitor, 
      resourcePreloader,
      SkeletonRenderer,
      createSkeletonHtml,
      pwaInstallPrompt 
    } from './frontendOptimizer.js';

    // 1. 显示骨架屏
    const container = document.getElementById('content');
    const skeleton = new SkeletonRenderer(
      container,
      createSkeletonHtml({ type: 'card', count: 3 })
    );
    skeleton.show();
    skeleton.startAnimation();

    // 2. 预加载关键资源
    await resourcePreloader.preloadImages([
      '/images/header.jpg',
      '/images/icon.png'
    ]);

    // 3. 懒加载其他图片
    lazyLoader.observeImages();

    // 4. 性能监控
    performanceMonitor.mark('page-load');
    
    // 5. 加载内容
    await loadContent();
    skeleton.hide();

    // 6. PWA 安装提示
    if (pwaInstallPrompt?.canInstall()) {
      document.getElementById('install-prompt').style.display = 'block';
      document.getElementById('install-btn').onclick = () => pwaInstallPrompt.install();
      document.getElementById('dismiss-btn').onclick = () => {
        document.getElementById('install-prompt').style.display = 'none';
      };
    }

    // 7. 上报性能
    performanceMonitor.report('/api/performance');
  </script>
</body>
</html>
```

## 性能优化建议

### 1. 首屏优化
- 使用骨架屏减少白屏时间
- 预加载首屏关键资源
- 延迟加载非关键资源

### 2. 图片优化
- 使用懒加载
- 压缩图片
- 使用现代格式 (WebP)
- 响应式图片

### 3. JavaScript 优化
- 代码分割
-  Tree shaking
- 防抖和节流
- Web Workers

### 4. CSS 优化
- 关键 CSS 内联
- 非关键 CSS 异步加载
- 减少选择器复杂度

## 浏览器兼容性

- **IntersectionObserver**: Chrome 51+, Firefox 55+, Safari 12.1+, Edge 15+
- **Performance API**: 现代浏览器均支持
- **CSS 动画**: 所有现代浏览器

对于不支持的浏览器，工具库会自动降级处理。

## 许可

MIT License
