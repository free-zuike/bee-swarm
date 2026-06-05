// ============================================
// Cloudflare 服务导出
// 统一导出所有 Cloudflare 服务
// ============================================

// 中间件
export {
  createKVLimiter,
  createGlobalKVLimiter,
  SlidingWindowRateLimiter,
} from './middleware/kvRateLimit';
export {
  SecurityService,
  bruteForceProtection,
  ipReputationCheck,
  suspiciousRequestCheck,
  sensitiveOperationProtection,
  enhancedCORSMiddleware,
} from './middleware/securityEnhancement';

// 服务
export {
  CacheService,
  getCacheService,
  UserDataCache,
  applyUserCache,
} from './services/cacheService';
export { VectorizeService, TemplateVectorManager } from './services/vectorizeService';
export {
  AnalyticsService,
  D1AnalyticsService,
  PushStatisticsCollector,
} from './services/analyticsService';
export { EnhancedQueueService } from './services/enhancedQueueService';
export { archiveOldDataToR2, retrieveArchiveFromR2, listArchivesFromR2 } from './services/r2ArchiveService';
export { getUserConfigWithCache, invalidateUserConfigCache, invalidateAllUserCaches } from './services/userConfigCache';
export { PermissionService } from './services/permissionService';
export { AIService } from './services/aiService';
export { SetupWizardService } from './services/setupWizardService';
export { FrontendCacheService, getCacheService as getFrontendCacheService, cache } from './services/frontendCacheService';
export {
  getAPIVersions,
  getVersionInfo,
  getCurrentVersionInfo,
  isVersionDeprecated,
  isVersionExpired,
  getVersionHeaders,
  APIVersionConverter,
  createVersionMiddleware,
  versionCompatible,
  CURRENT_API_VERSION,
} from './services/apiVersionService';
export {
  ErrorBoundaryService,
  handleGlobalError,
} from './services/errorBoundaryService';

// Durable Objects
export { HealthTrackerDO, WebSocketManagerDO, DistributedLockDO } from './durable/index';
