import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n';
import './LanguageSwitcher.css';

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ||
    SUPPORTED_LANGUAGES.find((l) => i18n.language?.startsWith(l.code)) ||
    SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="lang-switcher" ref={dropdownRef}>
      <button
        type="button"
        className="lang-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('language.select')}
        aria-expanded={isOpen}
      >
        <Globe size={16} aria-hidden="true" />
        <span className="lang-switcher-flag">{currentLang.flag}</span>
        <span className="lang-switcher-code">{currentLang.code.toUpperCase()}</span>
      </button>

      {isOpen && (
        <ul className="lang-switcher-dropdown" role="listbox" aria-label={t('language.select')}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <li key={lang.code} role="option" aria-selected={lang.code === currentLang.code}>
              <button
                type="button"
                className={`lang-switcher-option ${lang.code === currentLang.code ? 'active' : ''}`}
                onClick={() => handleSelect(lang.code)}
              >
                <span className="lang-option-flag">{lang.flag}</span>
                <span className="lang-option-label">{lang.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LanguageSwitcher;
