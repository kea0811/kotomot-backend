import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEnvironment extends Document {
  projectId: string;
  name: string;
  type: 'development' | 'test' | 'staging' | 'production' | 'custom';
  slug: string;
  description?: string;
  version: string;
  previousVersion?: string;
  color?: string;
  order: number;
  isActive: boolean;
  deployedAt?: Date;
  deployedBy?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const EnvironmentSchema = new Schema<IEnvironment>(
  {
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 100 },
    type: {
      type: String,
      required: true,
      enum: ['development', 'test', 'staging', 'production', 'custom'],
      default: 'custom'
    },
    slug: { type: String, required: true },
    description: { type: String },
    version: { type: String, required: true, default: '0.0.1' },
    previousVersion: { type: String },
    color: { type: String, default: '#3b82f6' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    deployedAt: { type: Date },
    deployedBy: { type: String },
    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

EnvironmentSchema.index({ projectId: 1, slug: 1 }, { unique: true });

export const Environment: Model<IEnvironment> =
  mongoose.models.Environment || mongoose.model<IEnvironment>('Environment', EnvironmentSchema);
