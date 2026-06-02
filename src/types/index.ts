// API Response Types
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: PaginationData;
}

export interface PaginationData {
  total: number;
  limit: number;
  offset: number;
  page?: number;
  totalPages?: number;
  hasMore: boolean;
}

// Language Types
export interface Language {
  _id?: string;
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  direction: 'ltr' | 'rtl';
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
}

// Project Types
export interface Project {
  _id?: string;
  id?: string;
  name: string;
  slug: string;
  description?: string;
  languages: string[];
  defaultLanguage: string;
  members: ProjectMember[];
  settings?: ProjectSettings;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface ProjectMember {
  userId: string;
  email: string;
  name?: string;
  role: 'owner' | 'admin' | 'translator' | 'reviewer' | 'viewer';
  permissions: string[];
  joinedAt: Date;
}

export interface ProjectSettings {
  autoTranslate?: boolean;
  requireReview?: boolean;
  allowMachineTranslation?: boolean;
  webhookUrl?: string;
  exportFormat?: 'json' | 'csv' | 'xml' | 'yaml';
}

// Translation Types
export interface Translation {
  _id?: string;
  projectId: string;
  key: string;
  namespace?: string;
  translations: Record<string, TranslationValue>;
  metadata?: TranslationMetadata;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface TranslationValue {
  value: string;
  status: 'draft' | 'translated' | 'reviewed' | 'approved';
  translatedBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  translatedAt?: Date;
  reviewedAt?: Date;
  approvedAt?: Date;
  comments?: Comment[];
}

export interface TranslationMetadata {
  description?: string;
  context?: string;
  maxLength?: number;
  tags?: string[];
  screenshots?: string[];
  references?: string[];
}

// Comment Types
export interface Comment {
  _id?: string;
  id?: string;
  content: string;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  createdAt: Date;
  updatedAt?: Date;
  resolved?: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  replies?: Comment[];
}

// Activity Types
export interface Activity {
  _id?: string;
  type: ActivityType;
  projectId: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type ActivityType =
  | 'translation.created'
  | 'translation.updated'
  | 'translation.deleted'
  | 'translation.reviewed'
  | 'translation.approved'
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'member.added'
  | 'member.removed'
  | 'member.role_changed'
  | 'comment.added'
  | 'comment.resolved';

// User Types
export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role: 'admin' | 'user';
  preferences?: UserPreferences;
  createdAt?: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  notifications?: NotificationPreferences;
}

export interface NotificationPreferences {
  email?: boolean;
  push?: boolean;
  translation?: boolean;
  review?: boolean;
  comment?: boolean;
}

// Form Types
export interface LoginFormData {
  email: string;
  password: string;
  remember?: boolean;
}

export interface SignupFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

export interface ProjectFormData {
  name: string;
  description?: string;
  languages: string[];
  defaultLanguage: string;
}

// Error Types
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 'RATE_LIMIT', 429);
  }
}

// Database Query Types
export interface QueryOptions {
  limit?: number;
  offset?: number;
  sort?: Record<string, 1 | -1>;
  populate?: string[];
  select?: string[];
}

export interface FilterOptions {
  search?: string;
  status?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  [key: string]: unknown;
}

// WebSocket Event Types
export interface WebSocketEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  userId?: string;
}

// Export/Import Types
export interface ExportOptions {
  format: 'json' | 'csv' | 'xml' | 'yaml';
  languages?: string[];
  namespaces?: string[];
  includeMetadata?: boolean;
  includeComments?: boolean;
}

export interface ImportOptions {
  format: 'json' | 'csv' | 'xml' | 'yaml';
  language: string;
  namespace?: string;
  overwrite?: boolean;
  skipExisting?: boolean;
}

// Session Types
export interface Session {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

// Rate Limit Types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number;
}
