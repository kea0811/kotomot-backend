import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITranslationHistory {
  version: number;
  text: string;
  status: 'draft' | 'review' | 'approved' | 'rejected';
  changedBy: string;
  changedAt: Date;
  comment?: string;
  source?: string;
  aiModel?: string;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
}

export interface ITranslation extends Document {
  keyId: string;
  text: string;
  status: 'draft' | 'review' | 'approved' | 'rejected';
  version: number;
  history: ITranslationHistory[];
  lastEditedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TranslationHistorySchema = new Schema<ITranslationHistory>({
  version: { type: Number, required: true },
  text: { type: String, required: true },
  status: {
    type: String,
    required: true,
    enum: ['draft', 'review', 'approved', 'rejected']
  },
  changedBy: { type: String, required: true },
  changedAt: { type: Date, default: Date.now },
  comment: { type: String },
  source: { type: String, default: 'manual' },
  aiModel: { type: String },
  tokenUsage: {
    input: Number,
    output: Number,
    total: Number,
  },
});

const TranslationSchema = new Schema<ITranslation>(
  {
    keyId: { type: String, required: true, unique: true },
    text: { type: String, default: '' },
    status: {
      type: String,
      default: 'draft',
      enum: ['draft', 'review', 'approved', 'rejected']
    },
    version: { type: Number, default: 1 },
    history: { type: [TranslationHistorySchema], default: [] },
    lastEditedBy: { type: String },
  },
  {
    timestamps: true,
  }
);

export const Translation: Model<ITranslation> = mongoose.models.Translation || mongoose.model<ITranslation>('Translation', TranslationSchema);
