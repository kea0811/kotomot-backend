import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProject extends Document {
  name: string;
  slug: string;
  description?: string;
  owner: string;
  members: {
    user: string;
    role: 'owner' | 'admin' | 'translator' | 'reviewer' | 'viewer';
    addedAt: Date;
  }[];
  languages: {
    language: Types.ObjectId;
    enabled: boolean;
    translators: Types.ObjectId[];
    reviewers: Types.ObjectId[];
  }[];
  defaultLanguage?: Types.ObjectId;
  settings: {
    autoTranslate: boolean;
    requireReview: boolean;
    allowMachineTranslation: boolean;
    namespaceDelimiter: string;
    keyDelimiter: string;
  };
  stats: {
    totalKeys: number;
    totalNamespaces: number;
    translationProgress: Map<string, number>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    owner: {
      type: String,
      required: true,
    },
    members: [
      {
        user: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          enum: ['owner', 'admin', 'translator', 'reviewer', 'viewer'],
          default: 'viewer',
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    languages: [
      {
        language: {
          type: Schema.Types.ObjectId,
          ref: 'Language',
          required: true,
        },
        enabled: {
          type: Boolean,
          default: true,
        },
        translators: [
          {
            type: Schema.Types.ObjectId,
            ref: 'User',
          },
        ],
        reviewers: [
          {
            type: Schema.Types.ObjectId,
            ref: 'User',
          },
        ],
      },
    ],
    defaultLanguage: {
      type: Schema.Types.ObjectId,
      ref: 'Language',
    },
    settings: {
      autoTranslate: {
        type: Boolean,
        default: false,
      },
      requireReview: {
        type: Boolean,
        default: true,
      },
      allowMachineTranslation: {
        type: Boolean,
        default: true,
      },
      namespaceDelimiter: {
        type: String,
        default: '.',
      },
      keyDelimiter: {
        type: String,
        default: '.',
      },
    },
    stats: {
      totalKeys: {
        type: Number,
        default: 0,
      },
      totalNamespaces: {
        type: Number,
        default: 0,
      },
      translationProgress: {
        type: Map,
        of: Number,
        default: new Map(),
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ProjectSchema.index({ slug: 1 });
ProjectSchema.index({ owner: 1 });
ProjectSchema.index({ 'members.user': 1 });

// Ensure slug is unique and valid
ProjectSchema.pre('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

const Project = mongoose.models.Project || mongoose.model<IProject>('Project', ProjectSchema);

export default Project;
