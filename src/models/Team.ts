import mongoose, { Schema, Document } from 'mongoose';

export interface ITeamMember {
  user: string;
  role: 'owner' | 'admin' | 'member';
  addedAt: Date;
}

export interface ITeam extends Document {
  name: string;
  description?: string;
  owner: string;
  members: ITeamMember[];
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    owner: { type: String, required: true, index: true },
    members: [
      {
        user: { type: String, required: true },
        role: {
          type: String,
          enum: ['owner', 'admin', 'member'],
          default: 'member',
        },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.models.Team || mongoose.model<ITeam>('Team', TeamSchema);
