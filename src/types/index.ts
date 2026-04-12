/** Represents a SharePoint site with storage information */
export interface SiteStorageInfo {
  id: string;
  displayName: string;
  webUrl: string;
  storageUsedInBytes: number;
  storageAllocatedInBytes: number;
  storageUsedPercentage: number;
  lastModifiedDateTime: string;
  owner?: string;
  template?: string;
}

/** Represents tenant-level storage summary */
export interface TenantStorageSummary {
  totalStorageInBytes: number;
  usedStorageInBytes: number;
  availableStorageInBytes: number;
  usedPercentage: number;
  siteCount: number;
  lastRefreshed: string;
}

/** Represents a large file found in SharePoint */
export interface LargeFileInfo {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  siteName: string;
  siteId: string;
  libraryName: string;
  lastModifiedDateTime: string;
  lastModifiedBy: string;
}

/** Represents a file version taking up space */
export interface FileVersionInfo {
  fileId: string;
  fileName: string;
  versionId: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string;
  siteName: string;
}

/** Represents a recycle bin item */
export interface RecycleBinItem {
  id: string;
  title: string;
  size: number;
  deletedDateTime: string;
  deletedBy: string;
  siteName: string;
  siteId: string;
  itemType: string;
}

/** Cleanup action types available */
export type CleanupActionType =
  | 'delete_versions'
  | 'empty_recycle_bin'
  | 'archive_site'
  | 'compress_files';

/** A cleanup recommendation */
export interface CleanupRecommendation {
  id: string;
  actionType: CleanupActionType;
  description: string;
  estimatedSavingsBytes: number;
  targetSiteId: string;
  targetSiteName: string;
  items: string[];
  risk: 'low' | 'medium' | 'high';
}

/** Application route names */
export type RouteName = 'dashboard' | 'sites' | 'cleanup' | 'export';

/** Auth state */
export interface AuthState {
  isAuthenticated: boolean;
  userName: string | null;
  userEmail: string | null;
  tenantId: string | null;
}
