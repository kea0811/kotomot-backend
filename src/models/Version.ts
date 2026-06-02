import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChangelogEntry {
  action: 'add_key' | 'update_translation' | 'delete_key' | 'revert';
  entity_type: 'translation_key' | 'translation' | 'project';
  key?: string;
  namespace?: string;
  language?: string;
  old_value?: string;
  new_value?: string;
  changed_by: {
    user_id: string;
    user_name: string;
  };
  approved_by?: {
    user_id: string;
    user_name: string;
  };
  timestamp: Date;
}

export interface IVersion extends Document {
  projectId: string;
  version_number: string;
  version_type: 'major' | 'minor' | 'patch';
  is_current: boolean;
  created_by: {
    user_id: string;
    user_name: string;
    team_id: string;
    team_name: string;
  };
  changelog: IChangelogEntry[];
  changelog_count: number;
  total_keys: number;
  languages: string[];
  reverted_from?: string;
  reverted_to?: string;
  // Frozen content for this release — what the SDK serves when an environment
  // is pinned to this version. [{ keyPath, namespaceId, translations }]
  snapshot?: { keyPath: string; namespaceId: string; translations: Record<string, string> }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IVersionConfig extends Document {
  projectId: string;
  current_version: string;
  auto_version_on_approval: boolean;
  version_strategy: 'manual' | 'auto-patch' | 'auto-minor';
  slack_notifications_enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChangelogEntrySchema = new Schema({
  action: { type: String, required: true, enum: ['add_key', 'update_translation', 'delete_key', 'revert'] },
  entity_type: { type: String, required: true, enum: ['translation_key', 'translation', 'project'] },
  key: String,
  namespace: String,
  language: String,
  old_value: String,
  new_value: String,
  changed_by: {
    user_id: { type: String, required: true },
    user_name: { type: String, required: true },
  },
  approved_by: {
    user_id: String,
    user_name: String,
  },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const VersionSchema = new Schema<IVersion>(
  {
    projectId: { type: String, required: true, index: true },
    version_number: { type: String, required: true },
    version_type: { type: String, required: true, enum: ['major', 'minor', 'patch'], default: 'patch' },
    is_current: { type: Boolean, default: false },
    created_by: {
      user_id: { type: String, required: true },
      user_name: { type: String, default: '' },
      team_id: { type: String, default: '' },
      team_name: { type: String, default: '' },
    },
    changelog: [ChangelogEntrySchema],
    changelog_count: { type: Number, default: 0 },
    total_keys: { type: Number, default: 0 },
    languages: [String],
    reverted_from: String,
    reverted_to: String,
    snapshot: { type: [Schema.Types.Mixed], default: undefined },
  },
  { timestamps: true }
);

VersionSchema.index({ projectId: 1, version_number: 1 }, { unique: true });
VersionSchema.index({ projectId: 1, is_current: 1 });

const VersionConfigSchema = new Schema<IVersionConfig>(
  {
    projectId: { type: String, required: true, unique: true },
    current_version: { type: String, default: '0.0.1' },
    auto_version_on_approval: { type: Boolean, default: false },
    version_strategy: { type: String, default: 'manual', enum: ['manual', 'auto-patch', 'auto-minor'] },
    slack_notifications_enabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Version: Model<IVersion> =
  mongoose.models.Version || mongoose.model<IVersion>('Version', VersionSchema);

export const VersionConfig: Model<IVersionConfig> =
  mongoose.models.VersionConfig || mongoose.model<IVersionConfig>('VersionConfig', VersionConfigSchema);
