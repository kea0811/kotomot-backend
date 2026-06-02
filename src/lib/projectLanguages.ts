import Project from '../models/Project';
import Language from '../models/Language';

/**
 * The languages active for a project.
 *
 * Source of truth is the project's own `languages` list (set via "Manage
 * Languages"). If a project has never been managed (empty list), we fall back to
 * the global enabled set so existing/unmanaged projects keep working.
 *
 * Returns Language documents (lean), sorted default-first then by name.
 */
export async function getProjectActiveLanguages(projectId?: string): Promise<any[]> {
  if (projectId) {
    const project: any = await Project.findById(projectId).select('languages').lean();
    const ids = (project?.languages || [])
      .filter((l: any) => l && l.enabled !== false && l.language)
      .map((l: any) => l.language);
    if (ids.length) {
      return Language.find({ _id: { $in: ids } })
        .sort({ isDefault: -1, name: 1 })
        .lean();
    }
  }
  // Fallback: the global enabled set (legacy default for unmanaged projects).
  return Language.find({ enabled: true }).sort({ isDefault: -1, name: 1 }).lean();
}
