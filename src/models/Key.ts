import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVariable {
  name: string;
  type: 'string' | 'number' | 'date';
  required: boolean;
}

export interface IKey extends Document {
  projectId: string;
  namespaceId: string;
  keyPath: string;
  description?: string;
  tags: string[];
  screenshots: string[];
  contextNotes?: string;
  variables: IVariable[];
  pluralization: boolean;
  translations: Record<string, string>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const VariableSchema = new Schema<IVariable>({
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ['string', 'number', 'date'] },
  required: { type: Boolean, required: true },
});

const KeySchema = new Schema<IKey>(
  {
    projectId: { type: String, required: true },
    namespaceId: { type: String, required: true },
    keyPath: { type: String, required: true },
    description: { type: String },
    tags: { type: [String], default: [] },
    screenshots: { type: [String], default: [] },
    contextNotes: { type: String },
    variables: { type: [VariableSchema], default: [] },
    pluralization: { type: Boolean, default: false },
    translations: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

KeySchema.index({ projectId: 1, namespaceId: 1, keyPath: 1 }, { unique: true });

export const Key: Model<IKey> = mongoose.models.Key || mongoose.model<IKey>('Key', KeySchema);
