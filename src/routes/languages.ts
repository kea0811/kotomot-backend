import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import connectDB from '../lib/db';
import Language from '../models/Language';
import Project from '../models/Project';
import { getProjectActiveLanguages } from '../lib/projectLanguages';

const router = Router();

// Language metadata for upsert when enabling languages
const LANGUAGE_DATA: Record<string, { name: string; nativeName: string; flag: string; direction: 'ltr' | 'rtl' }> = {
  en: { name: 'English', nativeName: 'English', flag: '🇺🇸', direction: 'ltr' },
  zh: { name: 'Chinese (Simplified)', nativeName: '中文(简体)', flag: '🇨🇳', direction: 'ltr' },
  'zh-hant': { name: 'Chinese (Traditional)', nativeName: '中文(繁體)', flag: '🇹🇼', direction: 'ltr' },
  ja: { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', direction: 'ltr' },
  es: { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', direction: 'ltr' },
  th: { name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭', direction: 'ltr' },
  ru: { name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', direction: 'ltr' },
  ko: { name: 'Korean', nativeName: '한국어', flag: '🇰🇷', direction: 'ltr' },
  vi: { name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', direction: 'ltr' },
  ar: { name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', direction: 'rtl' },
  nl: { name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', direction: 'ltr' },
  fr: { name: 'French', nativeName: 'Français', flag: '🇫🇷', direction: 'ltr' },
  de: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', direction: 'ltr' },
  it: { name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', direction: 'ltr' },
  pt: { name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', direction: 'ltr' },
  'pt-br': { name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flag: '🇧🇷', direction: 'ltr' },
  sv: { name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪', direction: 'ltr' },
  'zh-cn': { name: 'Chinese (Simplified)', nativeName: '中文(简体)', flag: '🇨🇳', direction: 'ltr' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', direction: 'ltr' },
  id: { name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', direction: 'ltr' },
  tr: { name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', direction: 'ltr' },
  pl: { name: 'Polish', nativeName: 'Polski', flag: '🇵🇱', direction: 'ltr' },
  uk: { name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦', direction: 'ltr' },
  ro: { name: 'Romanian', nativeName: 'Română', flag: '🇷🇴', direction: 'ltr' },
  el: { name: 'Greek', nativeName: 'Ελληνικά', flag: '🇬🇷', direction: 'ltr' },
  cs: { name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿', direction: 'ltr' },
  hu: { name: 'Hungarian', nativeName: 'Magyar', flag: '🇭🇺', direction: 'ltr' },
  da: { name: 'Danish', nativeName: 'Dansk', flag: '🇩🇰', direction: 'ltr' },
  fi: { name: 'Finnish', nativeName: 'Suomi', flag: '🇫🇮', direction: 'ltr' },
  no: { name: 'Norwegian', nativeName: 'Norsk', flag: '🇳🇴', direction: 'ltr' },
  sk: { name: 'Slovak', nativeName: 'Slovenčina', flag: '🇸🇰', direction: 'ltr' },
  bg: { name: 'Bulgarian', nativeName: 'Български', flag: '🇧🇬', direction: 'ltr' },
  hr: { name: 'Croatian', nativeName: 'Hrvatski', flag: '🇭🇷', direction: 'ltr' },
  sr: { name: 'Serbian', nativeName: 'Српски', flag: '🇷🇸', direction: 'ltr' },
  he: { name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱', direction: 'rtl' },
  fa: { name: 'Persian', nativeName: 'فارسی', flag: '🇮🇷', direction: 'rtl' },
  ur: { name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰', direction: 'rtl' },
  ms: { name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾', direction: 'ltr' },
  fil: { name: 'Filipino', nativeName: 'Filipino', flag: '🇵🇭', direction: 'ltr' },
  bn: { name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩', direction: 'ltr' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳', direction: 'ltr' },
};

// PATCH / — set project languages (replaces the entire list)
router.patch('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const { projectId, languages } = req.body;

    if (!Array.isArray(languages) || !languages.length) {
      return res.status(400).json({ success: false, error: 'languages must be a non-empty array' });
    }

    // Ensure the Language catalog docs exist (metadata only). Do NOT change the
    // global `enabled` flag here — per-project activation lives on the project,
    // so managing one project's languages never affects another.
    const languageDocs = [];
    for (const code of languages) {
      const normalizedCode = code.toLowerCase();
      const meta = LANGUAGE_DATA[normalizedCode];
      const setData = meta
        ? { ...meta }
        : { name: code, nativeName: code, flag: '', direction: 'ltr' as const };

      const lang = await Language.findOneAndUpdate(
        { code: normalizedCode },
        { $set: setData, $setOnInsert: { enabled: false } },
        { upsert: true, new: true }
      );
      languageDocs.push(lang);
    }

    // If projectId is provided, update the project's languages array
    if (projectId) {
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }

      // Replace the project's languages with exactly the provided list
      project.languages = languageDocs.map((lang) => ({
        language: lang._id,
        enabled: true,
        translators: [],
        reviewers: [],
      }));
      await project.save();
    }

    // The active set is stored per-project (above). The global `enabled` flag is
    // intentionally left untouched so changing one project's languages never
    // affects others.

    res.json({ success: true, languages: languageDocs });
  } catch (error) {
    console.error('Error updating languages:', error);
    res.status(500).json({ success: false, error: 'Failed to update languages' });
  }
});

// GET / — list languages.
//   default          → languages enabled for use (active columns/inputs).
//   ?catalog=true    → the full common catalog (built-in LANGUAGE_DATA merged
//                      with any DB languages) for the "Manage Languages" picker.
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    const wantCatalog = req.query.catalog === 'true';

    if (!wantCatalog) {
      // A project's active languages (its own list, or the global set as fallback).
      const projectId = req.query.projectId as string | undefined;
      const languages = await getProjectActiveLanguages(projectId);
      return res.json({ success: true, languages });
    }

    const dbLangs = await Language.find({}).lean();
    const byCode = new Map(dbLangs.map((l: any) => [l.code, l]));

    // Base catalog from the built-in list; overlay canonical metadata onto any
    // matching DB doc (keeps _id/enabled, fixes drifted name/flag).
    const catalog: any[] = Object.entries(LANGUAGE_DATA).map(([code, meta]) => {
      const db = byCode.get(code);
      return db ? { ...db, ...meta } : { code, ...meta, enabled: true };
    });

    // Include any DB-only languages that have real metadata (skip junk rows
    // where the name is just the code, e.g. an accidental upsert).
    for (const l of dbLangs as any[]) {
      if (!LANGUAGE_DATA[l.code] && l.name && l.name !== l.code) {
        catalog.push(l);
      }
    }

    catalog.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, languages: catalog });
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch languages' });
  }
});

export default router;
