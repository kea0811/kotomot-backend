import mongoose, { Schema, Document, Model } from 'mongoose';

export interface INamespace extends Document {
  projectId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NamespaceSchema = new Schema<INamespace>(
  {
    projectId: { type: String, required: true },
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String },
  },
  {
    timestamps: true,
  }
);

NamespaceSchema.index({ projectId: 1, name: 1 }, { unique: true });

export const Namespace: Model<INamespace> = mongoose.models.Namespace || mongoose.model<INamespace>('Namespace', NamespaceSchema);
