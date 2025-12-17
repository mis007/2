import { AppSettings, DEFAULT_SETTINGS, Theme } from '../types';
import { DEFAULT_KEY } from './zhipu';

const STORAGE_KEY = 'glm4_voice_settings_v3'; // Bumped version to v3 to load new defaults

export const loadSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // Merge stored settings with defaults to ensure new fields (like knowledgeBase) exist
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn("Failed to load settings", e);
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save settings", e);
  }
};

let keyRotationIndex = 0;

export const getActiveApiKey = (settings: AppSettings): string => {
  if (!settings.apiKeys || settings.apiKeys.trim().length === 0) {
    return DEFAULT_KEY;
  }

  // Split by comma, trim whitespace, and filter empty strings
  const keys = settings.apiKeys.split(/,|，/).map(k => k.trim()).filter(k => k.length > 0);
  
  if (keys.length === 0) return DEFAULT_KEY;

  // Round robin selection
  const key = keys[keyRotationIndex % keys.length];
  keyRotationIndex++; // Increment for next call
  
  // Reset to prevent overflow (optional, but good practice)
  if (keyRotationIndex >= keys.length * 100) {
    keyRotationIndex = 0;
  }

  return key;
};

export const applyTheme = (theme: Theme, customCss?: string) => {
  const root = document.documentElement;
  const themeStyle = document.getElementById('theme-style');

  // Reset variables first
  if (theme === Theme.CLAY_DARK) {
    root.style.setProperty('--bg-color', '#1e293b');
    root.style.setProperty('--text-color', '#f1f5f9');
    root.style.setProperty('--accent-color', '#94a3b8');
    root.style.setProperty('--primary-btn', '#f43f5e');
    root.style.setProperty('--secondary-btn', '#334155');
    root.style.setProperty('--success-color', '#34d399');
    root.style.setProperty('--error-color', '#7f1d1d');
    root.style.setProperty('--error-border', '#ef4444');
    
    root.style.setProperty('--shadow-light', 'rgba(255, 255, 255, 0.05)');
    root.style.setProperty('--shadow-dark', 'rgba(0, 0, 0, 0.5)');
    root.style.setProperty('--inner-shadow-light', 'rgba(255, 255, 255, 0.05)');
    root.style.setProperty('--inner-shadow-dark', 'rgba(0, 0, 0, 0.3)');
  } else if (theme === Theme.MINT_FRESH) {
    root.style.setProperty('--bg-color', '#ecfdf5');
    root.style.setProperty('--text-color', '#064e3b');
    root.style.setProperty('--accent-color', '#34d399');
    root.style.setProperty('--primary-btn', '#059669');
    root.style.setProperty('--secondary-btn', '#d1fae5');
    root.style.setProperty('--success-color', '#10b981');
    root.style.setProperty('--error-color', '#fef2f2');
    root.style.setProperty('--error-border', '#f87171');

    root.style.setProperty('--shadow-light', 'rgba(255, 255, 255, 0.8)');
    root.style.setProperty('--shadow-dark', 'rgba(6, 78, 59, 0.15)');
    root.style.setProperty('--inner-shadow-light', 'rgba(255, 255, 255, 0.6)');
    root.style.setProperty('--inner-shadow-dark', 'rgba(6, 78, 59, 0.1)');
  } else {
    // Default Clay Light - Remove overrides to fallback to CSS :root
    root.style.removeProperty('--bg-color');
    root.style.removeProperty('--text-color');
    root.style.removeProperty('--accent-color');
    root.style.removeProperty('--primary-btn');
    root.style.removeProperty('--secondary-btn');
    root.style.removeProperty('--success-color');
    root.style.removeProperty('--error-color');
    root.style.removeProperty('--error-border');
    root.style.removeProperty('--shadow-light');
    root.style.removeProperty('--shadow-dark');
    root.style.removeProperty('--inner-shadow-light');
    root.style.removeProperty('--inner-shadow-dark');
  }

  // Inject Custom CSS
  if (themeStyle) {
    themeStyle.innerHTML = customCss || '';
  }
};