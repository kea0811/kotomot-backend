import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProjectTeamPermissions {
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  requires_approval: boolean;
}

export interface IProjectTeam extends Document {
  team: Types.ObjectId;
  project: Types.ObjectId;
  permissions: IProjectTeamPermissions;
  assignedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectTeamSchema = new Schema<IProjectTeam>(
  {
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    permissions: {
      can_read: { type: Boolean, default: true },
      can_write: { type: Boolean, default: true },
      can_delete: { type: Boolean, default: false },
      requires_approval: { type: Boolean, default: false },
    },
    assignedBy: { type: String, required: true },
  },
  { timestamps: true }
);

// one assignment per (team, project)
ProjectTeamSchema.index({ team: 1, project: 1 }, { unique: true });

export default mongoose.models.ProjectTeam ||
  mongoose.model<IProjectTeam>('ProjectTeam', ProjectTeamSchema);
