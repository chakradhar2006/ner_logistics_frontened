import { translations } from './translations.js';
import { DEFAULT_LANGUAGE, LANGUAGES } from './languages.js';
import { settingsApi } from '../api/client.js';

const STORAGE_KEY = 'nerLanguage';
const listeners = new Set();

export function getLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

// Looks up a translation for the current language, falling back to English
// and then to the key itself so missing translations never render blank.
export function t(key, lang = getLanguage()) {
  return translations[lang]?.[key] ?? translations[DEFAULT_LANGUAGE]?.[key] ?? key;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function setLanguage(lang, { persistToBackend = true } = {}) {
  if (!LANGUAGES.some((l) => l.code === lang)) return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private browsing / storage disabled — language just won't persist across sessions */
  }
  document.documentElement.setAttribute('lang', lang);
  applyTranslations(document);
  listeners.forEach((fn) => fn(lang));

  if (persistToBackend) {
    try {
      await settingsApi.update({ language: lang });
    } catch {
      /* not logged in yet, or backend unreachable — localStorage is still authoritative for this device */
    }
  }
}

// Walks every element with data-i18n / data-i18n-placeholder under `root`
// and fills in the current language's text. Called on every page mount
// (see legacy.js initPageBehaviors) and whenever the language changes.
export function applyTranslations(root) {
  const scope = root || document;
  const lang = getLanguage();

  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key, lang);
  });

  scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key, lang));
  });

  scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    el.setAttribute('title', t(key, lang));
  });
}

// Called once at app startup: restores the saved language (or the one
// stored in the user's account settings, if that's more current) and
// applies it immediately.
export async function initLanguage() {
  document.documentElement.setAttribute('lang', getLanguage());
  applyTranslations(document);
  try {
    const { settings } = await settingsApi.get();
    if (settings?.language && settings.language !== getLanguage()) {
      await setLanguage(settings.language, { persistToBackend: false });
    }
  } catch {
    /* not logged in yet — localStorage value (or default English) stands */
  }
}
