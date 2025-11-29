import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import sr from './locales/sr.json';
import en from './locales/en.json';

// Get saved language from localStorage or detect from browser
const getInitialLanguage = () => {
  const saved = localStorage.getItem('appLanguage');
  if (saved) return saved;
  
  // Detect browser language
  const browserLang = navigator.language || navigator.userLanguage;
  const langCode = browserLang.split('-')[0].toLowerCase();
  
  // Support sr, en, or default to en
  if (langCode === 'sr') return 'sr';
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      sr: { translation: sr },
      en: { translation: en }
    },
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

// Save language to localStorage when it changes
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('appLanguage', lng);
});

export default i18n;

