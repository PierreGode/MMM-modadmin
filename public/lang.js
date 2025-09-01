const translations = {
  en: {
    title: "Module Admin",
    edit: "Edit",
    addSetting: "Add Setting",
    save: "Save",
    cancel: "Cancel",
    settings: "Settings",
    close: "Close"
  },
  sv: {
    title: "Moduladministratör",
    edit: "Redigera",
    addSetting: "Lägg till inställning",
    save: "Spara",
    cancel: "Avbryt",
    settings: "Inställningar",
    close: "Stäng"
  }
};

let currentLang = localStorage.getItem('lang') || 'en';

function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[currentLang] && translations[currentLang][key]) {
      el.textContent = translations[currentLang][key];
    }
  });
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  applyTranslations();
}

document.addEventListener('DOMContentLoaded', () => {
  const select = document.getElementById('languageSelect');
  if (select) {
    select.value = currentLang;
    select.addEventListener('change', () => setLanguage(select.value));
  }
  applyTranslations();
});
