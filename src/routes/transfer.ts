import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import connectDB from '../lib/db';
import Project from '../models/Project';
import { Key } from '../models/Key';
import { Namespace } from '../models/Namespace';
import Language from '../models/Language';
import { accessibleProjectOr } from '../lib/projectAccess';

const router = Router();

// ---------- helpers ----------

function namespaceOf(k: any): string {
  return k.namespaceId || (k.keyPath || '').split('.')[0] || 'common';
}

/** { "a.b.c": "v" } -> { a: { b: { c: "v" } } } */
function unflatten(flat: Record<string, string>) {
  const out: any = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let node = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) node[p] = value;
      else node = node[p] = node[p] || {};
    });
  }
  return out;
}

/** { a: { b: "v" } } -> { "a.b": "v" } */
function flatten(obj: any, prefix = '', out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v == null ? '' : String(v);
  }
  return out;
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Minimal RFC-4180-ish CSV parser supporting quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }
  return rows;
}

/**
 * Normalize any supported import payload into a list of incoming entries:
 * { keyPath, translations: { [lang]: value } }.
 *  - csv: header `key,<lang>,<lang>...`
 *  - json: language bundle `{ "<lang>": { nested-or-flat keyPath: value } }`
 */
function parseImport(format: string, content: string): { keyPath: string; translations: Record<string, string> }[] {
  if (format === 'csv') {
    const rows = parseCsv(content);
    if (rows.length < 2) return [];
    const header = rows[0].map((h) => h.trim());
    const langCols = header.slice(1); // first column is the key
    return rows.slice(1).map((cols) => {
      const translations: Record<string, string> = {};
      langCols.forEach((lang, idx) => {
        const val = cols[idx + 1];
        if (val != null && val !== '') translations[lang] = val;
      });
      return { keyPath: cols[0], translations };
    });
  }

  // JSON language bundle
  const parsed = JSON.parse(content);
  const byKey = new Map<string, Record<string, string>>();
  for (const [lang, tree] of Object.entries(parsed)) {
    const flat = flatten(tree);
    for (const [keyPath, value] of Object.entries(flat)) {
      if (!byKey.has(keyPath)) byKey.set(keyPath, {});
      byKey.get(keyPath)![lang] = value;
    }
  }
  return Array.from(byKey.entries()).map(([keyPath, translations]) => ({ keyPath, translations }));
}

async function resolveProject(slug: string, userId?: string) {
  return Project.findOne({ slug, $or: await accessibleProjectOr(userId) })
    .select('_id name')
    .lean();
}

// ---------- export ----------

// GET /:slug/export?format=&languages=&namespaces=&includeEmpty=&minify=
router.get('/:slug/export', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const project: any = await resolveProject(String(req.params.slug), req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const projectId = project._id.toString();
    const format = (req.query.format as string) || 'json';
    const includeEmpty = req.query.includeEmpty === 'true';
    const minify = req.query.minify === 'true';
    const langFilter = ((req.query.languages as string) || '').split(',').filter(Boolean);
    const nsFilter = ((req.query.namespaces as string) || '').split(',').filter(Boolean);

    const enabled = await Language.find({ enabled: true }).sort({ isDefault: -1, name: 1 }).lean();
    const languages = (langFilter.length ? langFilter : enabled.map((l) => l.code)).filter(Boolean);

    let keys = await Key.find({ projectId }).sort({ keyPath: 1 }).lean();
    if (nsFilter.length) keys = keys.filter((k) => nsFilter.includes(namespaceOf(k)));

    // Build flat { lang: { keyPath: value } }
    const perLang: Record<string, Record<string, string>> = {};
    languages.forEach((l) => (perLang[l] = {}));
    for (const k of keys) {
      const translations = (k as any).translations || {};
      for (const lang of languages) {
        const val = translations[lang] || '';
        if (val !== '' || includeEmpty) perLang[lang][(k as any).keyPath] = val;
      }
    }

    let body: string;
    let contentType = 'application/json; charset=utf-8';
    let ext = 'json';

    if (format === 'csv') {
      const header = ['key', ...languages];
      const lines = [header.map(csvEscape).join(',')];
      for (const k of keys) {
        const t = (k as any).translations || {};
        const row = [(k as any).keyPath, ...languages.map((l) => t[l] || '')];
        if (!includeEmpty && languages.every((l) => !(t[l] || '').trim())) continue;
        lines.push(row.map((v) => csvEscape(String(v))).join(','));
      }
      body = lines.join('\n');
      contentType = 'text/csv; charset=utf-8';
      ext = 'csv';
    } else if (format === 'json-flat') {
      body = JSON.stringify(perLang, null, minify ? undefined : 2);
    } else {
      // nested json bundle
      const nested: Record<string, any> = {};
      for (const lang of languages) nested[lang] = unflatten(perLang[lang]);
      body = JSON.stringify(nested, null, minify ? undefined : 2);
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${project.name || req.params.slug}-translations.${ext}"`
    );
    res.send(body);
  } catch (error: any) {
    console.error('Error exporting translations:', error);
    res.status(500).json({ error: error.message || 'Failed to export translations' });
  }
});

// ---------- import ----------

function diffImport(
  incoming: { keyPath: string; translations: Record<string, string> }[],
  existingByPath: Map<string, any>
) {
  let newKeys = 0;
  let updatedKeys = 0;
  const langs = new Set<string>();
  const conflicts: {
    keyPath: string;
    language: string;
    current: string;
    incoming: string;
    action: 'replace' | 'skip';
  }[] = [];

  for (const entry of incoming) {
    Object.keys(entry.translations).forEach((l) => langs.add(l));
    const existing = existingByPath.get(entry.keyPath);
    if (!existing) {
      newKeys++;
      continue;
    }
    updatedKeys++;
    const current = existing.translations || {};
    for (const [lang, value] of Object.entries(entry.translations)) {
      const cur = current[lang];
      if (cur != null && cur !== '' && cur !== value) {
        conflicts.push({ keyPath: entry.keyPath, language: lang, current: cur, incoming: value, action: 'replace' });
      }
    }
  }
  return { newKeys, updatedKeys, languages: Array.from(langs), conflicts };
}

// POST /:slug/import/preview  { format, content, namespace? }
router.post('/:slug/import/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const project: any = await resolveProject(String(req.params.slug), req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { format, content } = req.body as { format: string; content: string };
    let incoming: { keyPath: string; translations: Record<string, string> }[];
    try {
      incoming = parseImport(format, content);
    } catch (e: any) {
      return res.status(400).json({ error: `Could not parse file: ${e.message}` });
    }

    const existing = await Key.find({ projectId: project._id.toString() }).lean();
    const existingByPath = new Map(existing.map((k: any) => [k.keyPath, k]));
    const { newKeys, updatedKeys, languages, conflicts } = diffImport(incoming, existingByPath);

    const sample = incoming.slice(0, 8).map((e) => ({
      keyPath: e.keyPath,
      namespace: e.keyPath.split('.')[0],
      translations: e.translations,
    }));

    res.json({
      success: true,
      totalKeys: incoming.length,
      newKeys,
      updatedKeys,
      languages,
      conflicts,
      sample,
    });
  } catch (error: any) {
    console.error('Error previewing import:', error);
    res.status(500).json({ error: error.message || 'Failed to preview import' });
  }
});

// POST /:slug/import/apply  { format, content, namespace?, conflictResolution, createMissingKeys }
router.post('/:slug/import/apply', requireAuth, async (req: Request, res: Response) => {
  try {
    await connectDB();
    const project: any = await resolveProject(String(req.params.slug), req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const projectId = project._id.toString();

    const {
      format,
      content,
      namespace,
      conflictResolution = 'replace',
      createMissingKeys = true,
    } = req.body as {
      format: string;
      content: string;
      namespace?: string;
      conflictResolution?: 'replace' | 'skip';
      createMissingKeys?: boolean;
    };

    let incoming: { keyPath: string; translations: Record<string, string> }[];
    try {
      incoming = parseImport(format, content);
    } catch (e: any) {
      return res.status(400).json({ error: `Could not parse file: ${e.message}` });
    }

    const existing = await Key.find({ projectId }).lean();
    const existingByPath = new Map(existing.map((k: any) => [k.keyPath, k]));

    // Ensure a Namespace doc exists for every namespace the import references
    // (keys store the namespace by name, but the namespace list also reads the
    // Namespace collection).
    const nsNames = new Set<string>();
    for (const entry of incoming) {
      nsNames.add(namespace || entry.keyPath.split('.')[0] || 'common');
    }
    await Promise.all(
      Array.from(nsNames).map((name) =>
        Namespace.updateOne(
          { projectId, name },
          { $setOnInsert: { projectId, name } },
          { upsert: true }
        )
      )
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const entry of incoming) {
      const current = existingByPath.get(entry.keyPath);
      const ns = namespace || entry.keyPath.split('.')[0] || 'common';

      if (!current) {
        if (!createMissingKeys) {
          skipped++;
          continue;
        }
        await Key.create({
          projectId,
          namespaceId: ns,
          keyPath: entry.keyPath,
          description: '',
          tags: [],
          screenshots: [],
          variables: [],
          pluralization: false,
          translations: entry.translations,
          createdBy: req.userId,
        });
        created++;
      } else {
        const merged = { ...(current.translations || {}) };
        let changed = false;
        for (const [lang, value] of Object.entries(entry.translations)) {
          const cur = merged[lang];
          const isConflict = cur != null && cur !== '' && cur !== value;
          if (isConflict && conflictResolution === 'skip') continue;
          if (merged[lang] !== value) {
            merged[lang] = value;
            changed = true;
          }
        }
        if (changed) {
          await Key.updateOne({ _id: current._id }, { $set: { translations: merged } });
          updated++;
        } else {
          skipped++;
        }
      }
    }

    res.json({ success: true, created, updated, skipped, total: incoming.length });
  } catch (error: any) {
    console.error('Error applying import:', error);
    res.status(500).json({ error: error.message || 'Failed to import translations' });
  }
});

export default router;
