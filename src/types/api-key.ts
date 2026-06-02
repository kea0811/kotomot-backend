// API Key Types and Interfaces

export interface ApiKey {
  _id?: string;
  id?: string;
  userId: string;
  projectId?: string; // Optional: if API key is project-specific
  name: string;
  key: string; // The actual API key (shown once to user)
  keyHash: string; // Hashed version stored in DB
  permissions: ApiKeyPermission[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  usageCount: number;
  rateLimit?: ApiKeyRateLimit;
  metadata?: ApiKeyMetadata;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ApiKeyPermission =
  | 'read:translations'
  | 'write:translations'
  | 'delete:translations'
  | 'read:projects'
  | 'write:projects'
  | 'delete:projects'
  | 'read:keys'
  | 'write:keys'
  | 'delete:keys'
  | 'admin:all';

export interface ApiKeyRateLimit {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
}

export interface ApiKeyMetadata {
  description?: string;
  environment?: 'development' | 'staging' | 'production';
  ipWhitelist?: string[];
  allowedOrigins?: string[];
  userAgent?: string;
}

export interface CreateApiKeyRequest {
  name: string;
  permissions: ApiKeyPermission[];
  expiresAt?: Date;
  projectId?: string;
  metadata?: ApiKeyMetadata;
  rateLimit?: ApiKeyRateLimit;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key?: string; // Only returned when creating a new key
  permissions: ApiKeyPermission[];
  expiresAt?: Date;
  projectId?: string;
  metadata?: ApiKeyMetadata;
  isActive: boolean;
  lastUsedAt?: Date;
  usageCount: number;
  createdAt: Date;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  userId?: string;
  permissions?: ApiKeyPermission[];
  projectId?: string;
  error?: string;
}
