// The 12 languages requested for Northeast India coverage.
// `confidence` is shown honestly in the UI: these translations are
// AI-generated. Hindi/Bengali/Assamese/Nepali/Mizo are well-resourced
// languages where quality should be solid. Meitei, Bodo, Khasi, Garo,
// Kokborok and Nagamese are lower-resource languages — treat these as a
// reasonable starting point, not production-verified translations, and
// have a native speaker review them before relying on them operationally.
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', confidence: 'high' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', confidence: 'high' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', confidence: 'high' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', confidence: 'high' },
  { code: 'mni', name: 'Meitei (Manipuri)', native: 'মৈইতৈইলোন্', confidence: 'medium' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', confidence: 'high' },
  { code: 'brx', name: 'Bodo', native: 'बर\'', confidence: 'medium' },
  { code: 'kha', name: 'Khasi', native: 'Khasi', confidence: 'medium' },
  { code: 'grt', name: 'Garo', native: "A'chik", confidence: 'medium' },
  { code: 'lus', name: 'Mizo', native: 'Mizo ṭawng', confidence: 'high' },
  { code: 'trp', name: 'Kokborok', native: 'Kokborok', confidence: 'medium' },
  { code: 'nag', name: 'Nagamese', native: 'Nagamese', confidence: 'medium' },
];

export const DEFAULT_LANGUAGE = 'en';
