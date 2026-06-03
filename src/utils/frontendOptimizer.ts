// ============================================
// 前端性能优化工具库
// ============================================

export interface LazyLoadOptions {
  root?: Element;
  rootMargin?: string;
  threshold?: number;
  loadingClass?: string;
  loadedClass?: string;
}

export class LazyLoader {
  private observer: IntersectionObserver | null = null;
  private options: Required<Omit<LazyLoadOptions, 'root'>> & { root: Element | null };
  private loadedCount = 0;

  constructor(options: LazyLoadOptions = {}) {
    this.options = {
      root: options.root ?? null,
      rootMargin: options.rootMargin || '50px',
      threshold: options.threshold || 0.1,
      loadingClass: options.loadingClass || 'lazy-loading',
      loadedClass: options.loadedClass || 'lazy-loaded',
    };
  }

  /**
   * 懒加载图片
   */
  observeImages(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      // 不支持 IntersectionObserver，直接加载所有图片
      this.loadAllImages();
      return;
    }

    const images = document.querySelectorAll('img[data-src]');
    
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            this.loadImage(img);
            this.observer?.unobserve(img);
          }
        });
      },
      {
        root: this.options.root,
        rootMargin: this.options.rootMargin,
        threshold: this.options.threshold,
      }
    );

    images.forEach((img) => {
      img.classList.add(this.options.loadingClass);
      this.observer?.observe(img);
    });
  }

  /**
   * 加载单张图片
   */
  private loadImage(img: HTMLImageElement): void {
    const src = img.dataset.src;
    if (!src) return;

    const tempImg = new Image();
    
    tempImg.onload = () => {
      img.src = src;
      img.classList.remove(this.options.loadingClass);
      img.classList.add(this.options.loadedClass);
      this.loadedCount++;
    };

    tempImg.onerror = () => {
      console.error(`Failed to load image: ${src}`);
      img.classList.remove(this.options.loadingClass);
    };

    tempImg.src = src;
  }

  /**
   * 加载所有图片（不支持 IntersectionObserver 时）
   */
  private loadAllImages(): void {
    const images = document.querySelectorAll('img[data-src]');
    images.forEach((img) => {
      const htmlImg = img as HTMLImageElement;
      const src = htmlImg.dataset.src;
      if (src) {
        htmlImg.src = src;
        htmlImg.removeAttribute('data-src');
      }
    });
  }

  /**
   * 懒加载元素
   */
  observeElement(element: Element, callback: () => void): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      callback();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callback();
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: this.options.root,
        rootMargin: this.options.rootMargin,
        threshold: this.options.threshold,
      }
    );

    observer.observe(element);
  }

  /**
   * 获取已加载数量
   */
  getLoadedCount(): number {
    return this.loadedCount;
  }

  /**
   * 销毁观察者
   */
  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;
    
    if (timeout) clearTimeout(timeout);
    
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;
    
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * 性能监控
 */
export class PerformanceMonitor {
  private marks: Map<string, number> = new Map();
  private measures: Array<{ name: string; duration: number }> = [];

  /**
   * 记录性能标记
   */
  mark(name: string): void {
    if (typeof performance !== 'undefined') {
      performance.mark(name);
      this.marks.set(name, Date.now());
    }
  }

  /**
   * 测量性能
   */
  measure(name: string, startMark?: string, endMark?: string): number {
    if (typeof performance === 'undefined') return 0;

    try {
      if (startMark && endMark) {
        performance.measure(name, startMark, endMark);
      } else if (startMark) {
        performance.measure(name, startMark);
      }
      
      const entries = performance.getEntriesByName(name);
      if (entries.length > 0) {
        const duration = entries[entries.length - 1].duration;
        this.measures.push({ name, duration });
        return duration;
      }
    } catch (error) {
      console.error('Performance measure error:', error);
    }
    
    return 0;
  }

  /**
   * 获取性能指标
   */
  getMetrics(): {
    fcp?: number;
    lcp?: number;
    fid?: number;
    cls?: number;
    ttfb?: number;
  } {
    if (typeof performance === 'undefined' || !('getEntriesByType' in performance)) {
      return {};
    }

    const metrics: any = {};

    // First Contentful Paint
    const fcpEntries = performance.getEntriesByType('paint');
    const fcp = fcpEntries.find((entry) => entry.name === 'first-contentful-paint');
    if (fcp) metrics.fcp = fcp.startTime;

    // Largest Contentful Paint
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length > 0) {
      metrics.lcp = lcpEntries[lcpEntries.length - 1].startTime;
    }

    // First Input Delay
    const fidEntries = performance.getEntriesByType('first-input');
    if (fidEntries.length > 0) {
      metrics.fid = (fidEntries[0] as any).processingStart - fidEntries[0].startTime;
    }

    // Time to First Byte
    const ttfbEntries = performance.getEntriesByType('navigation');
    if (ttfbEntries.length > 0) {
      metrics.ttfb = (ttfbEntries[0] as any).responseStart;
    }

    return metrics;
  }

  /**
   * 上报性能数据
   */
  report(endpoint?: string): void {
    const metrics = this.getMetrics();
    
    if (endpoint) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics,
          measures: this.measures,
          timestamp: Date.now(),
          url: typeof window !== 'undefined' ? window.location.href : '',
        }),
      }).catch(() => {
        // 静默处理错误
      });
    }

    // 打印到控制台
    console.log('Performance Metrics:', metrics);
  }
}

/**
 * 骨架屏渲染器
 */
export class SkeletonRenderer {
  private container: HTMLElement;
  private skeletonHtml: string;

  constructor(container: HTMLElement, skeletonHtml: string) {
    this.container = container;
    this.skeletonHtml = skeletonHtml;
  }

  /**
   * 显示骨架屏
   */
  show(): void {
    this.container.innerHTML = this.skeletonHtml;
    this.container.classList.add('skeleton-visible');
  }

  /**
   * 隐藏骨架屏
   */
  hide(): void {
    this.container.classList.remove('skeleton-visible');
  }

  /**
   * 动画骨架屏
   */
  startAnimation(): void {
    this.container.classList.add('skeleton-animated');
  }

  /**
   * 停止动画
   */
  stopAnimation(): void {
    this.container.classList.remove('skeleton-animated');
  }
}

/**
 * 创建骨架屏 HTML
 */
export function createSkeletonHtml(options: {
  type: 'card' | 'list' | 'form' | 'table';
  count?: number;
}): string {
  const count = options.count || 3;

  switch (options.type) {
    case 'card':
      return Array(count)
        .fill('')
        .map(
          () => `
        <div class="skeleton-card">
          <div class="skeleton-image"></div>
          <div class="skeleton-title"></div>
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      `
        )
        .join('');

    case 'list':
      return Array(count)
        .fill('')
        .map(
          () => `
        <div class="skeleton-list-item">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-content">
            <div class="skeleton-title"></div>
            <div class="skeleton-text"></div>
          </div>
        </div>
      `
        )
        .join('');

    case 'form':
      return `
        <div class="skeleton-form-group">
          <div class="skeleton-label"></div>
          <div class="skeleton-input"></div>
        </div>
        <div class="skeleton-form-group">
          <div class="skeleton-label"></div>
          <div class="skeleton-textarea"></div>
        </div>
        <div class="skeleton-form-group">
          <div class="skeleton-button"></div>
        </div>
      `;

    case 'table':
      return `
        <div class="skeleton-table-header">
          <div class="skeleton-th"></div>
          <div class="skeleton-th"></div>
          <div class="skeleton-th"></div>
        </div>
        ${Array(count)
          .fill('')
          .map(
            () => `
          <div class="skeleton-table-row">
            <div class="skeleton-td"></div>
            <div class="skeleton-td"></div>
            <div class="skeleton-td"></div>
          </div>
        `
          )
          .join('')}
      `;

    default:
      return '';
  }
}

/**
 * 资源预加载
 */
export class ResourcePreloader {
  private preloadedUrls: Set<string> = new Set();

  /**
   * 预加载图片
   */
  preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.preloadedUrls.has(url)) {
        resolve();
        return;
      }

      const img = new Image();
      img.onload = () => {
        this.preloadedUrls.add(url);
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * 预加载多个图片
   */
  async preloadImages(urls: string[]): Promise<void[]> {
    return Promise.all(urls.map((url) => this.preloadImage(url)));
  }

  /**
   * 预加载脚本
   */
  preloadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.preloadedUrls.has(url)) {
        resolve();
        return;
      }

      const script = document.createElement('link');
      script.rel = 'preload';
      script.as = 'script';
      script.href = url;
      script.onload = () => {
        this.preloadedUrls.add(url);
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * 预加载样式
   */
  preloadStylesheet(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.preloadedUrls.has(url)) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = url;
      link.onload = () => {
        this.preloadedUrls.add(url);
        resolve();
      };
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }
}

/**
 * PWA 安装提示
 */
export class PWAInstallPrompt {
  private deferredPrompt: any = null;

  constructor() {
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      console.log('PWA installed successfully');
    });
  }

  /**
   * 检查是否可以安装
   */
  canInstall(): boolean {
    return this.deferredPrompt !== null;
  }

  /**
   * 触发安装提示
   */
  async install(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    try {
      await this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }

      this.deferredPrompt = null;
      return outcome === 'accepted';
    } catch (error) {
      console.error('Install prompt error:', error);
      return false;
    }
  }
}

// 导出默认实例
export const lazyLoader = new LazyLoader();
export const performanceMonitor = new PerformanceMonitor();
export const resourcePreloader = new ResourcePreloader();
export const pwaInstallPrompt = typeof window !== 'undefined' ? new PWAInstallPrompt() : null;
