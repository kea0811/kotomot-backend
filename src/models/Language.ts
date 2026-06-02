import mongoose, { Schema, Document } from 'mongoose';

export interface ILanguage extends Document {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  direction: 'ltr' | 'rtl';
  enabled: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LanguageSchema = new Schema<ILanguage>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nativeName: {
      type: String,
      required: true,
      trim: true,
    },
    flag: {
      type: String,
      required: true,
    },
    direction: {
      type: String,
      enum: ['ltr', 'rtl'],
      default: 'ltr',
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one default language
LanguageSchema.pre('save', async function (next) {
  if (this.isDefault) {
    await mongoose.model('Language').updateMany(
      { _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

const Language = mongoose.models.Language || mongoose.model<ILanguage>('Language', LanguageSchema);

export default Language;
