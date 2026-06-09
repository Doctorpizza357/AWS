/**
 * AvatarCustomization - Screen for selecting avatar base style, color palette, and cosmetics.
 */
import React, { useState } from 'react';
import './AvatarCustomization.css';

const BASE_STYLES = [
  { id: 'style-a', label: 'Explorer', shape: 'circle' },
  { id: 'style-b', label: 'Builder', shape: 'square' },
  { id: 'style-c', label: 'Pioneer', shape: 'triangle' },
];

const COLOR_PALETTES = [
  { id: 'blue', label: 'Ocean Blue', color: '#4A90D9' },
  { id: 'red', label: 'Fire Red', color: '#E74C3C' },
  { id: 'green', label: 'Forest Green', color: '#27AE60' },
  { id: 'purple', label: 'Royal Purple', color: '#9B59B6' },
];

const COSMETICS = [
  { id: 'backpack-blue', label: 'Blue Backpack', icon: '🎒', unlockLevel: 1 },
  { id: 'hat-grad', label: 'Graduation Cap', icon: '🎓', unlockLevel: 2 },
  { id: 'glasses-tech', label: 'Tech Glasses', icon: '👓', unlockLevel: 3 },
  { id: 'scarf-stem', label: 'STEM Scarf', icon: '🧣', unlockLevel: 4 },
  { id: 'badge-gold', label: 'Gold Badge', icon: '🏅', unlockLevel: 5 },
  { id: 'wings-code', label: 'Code Wings', icon: '🦋', unlockLevel: 6 },
];

function AvatarCustomization({
  currentAppearance = {},
  unlockedCosmetics = [],
  playerLevel = 1,
  onConfirm,
  isInitialSetup = false,
}) {
  const [baseStyle, setBaseStyle] = useState(currentAppearance.baseStyle || '');
  const [palette, setPalette] = useState(currentAppearance.palette || '');
  const [selectedCosmetics, setSelectedCosmetics] = useState(currentAppearance.cosmetics || []);

  const availableCosmetics = COSMETICS.filter(c =>
    c.unlockLevel <= playerLevel || unlockedCosmetics.includes(c.id)
  );

  const toggleCosmetic = (cosmeticId) => {
    setSelectedCosmetics(prev =>
      prev.includes(cosmeticId)
        ? prev.filter(id => id !== cosmeticId)
        : [...prev, cosmeticId]
    );
  };

  const canConfirm = baseStyle && palette;

  const handleConfirm = () => {
    if (canConfirm && onConfirm) {
      onConfirm({
        baseStyle,
        palette,
        cosmetics: selectedCosmetics,
      });
    }
  };

  return (
    <div className="avatar-custom" role="dialog" aria-label="Avatar Customization">
      <div className="avatar-custom__panel">
        <h2 className="avatar-custom__title">
          {isInitialSetup ? 'Create Your Avatar' : 'Customize Avatar'}
        </h2>

        {/* Preview */}
        <div className="avatar-custom__preview" aria-label="Avatar preview">
          <div
            className={`avatar-preview avatar-preview--${baseStyle || 'style-a'}`}
            style={{ backgroundColor: COLOR_PALETTES.find(p => p.id === palette)?.color || '#666' }}
          >
            <span className="avatar-preview__face">😊</span>
          </div>
          {selectedCosmetics.length > 0 && (
            <div className="avatar-preview__cosmetics">
              {selectedCosmetics.map(id => {
                const item = COSMETICS.find(c => c.id === id);
                return item ? <span key={id}>{item.icon}</span> : null;
              })}
            </div>
          )}
        </div>

        {/* Base Style */}
        <section className="avatar-custom__section">
          <h3>Character Style</h3>
          <div className="avatar-custom__options" role="radiogroup" aria-label="Base style selection">
            {BASE_STYLES.map(style => (
              <button
                key={style.id}
                className={`avatar-custom__option ${baseStyle === style.id ? 'selected' : ''}`}
                onClick={() => setBaseStyle(style.id)}
                role="radio"
                aria-checked={baseStyle === style.id}
                aria-label={style.label}
              >
                <span className="avatar-custom__shape">{style.shape === 'circle' ? '●' : style.shape === 'square' ? '■' : '▲'}</span>
                <span>{style.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Color Palette */}
        <section className="avatar-custom__section">
          <h3>Color Palette</h3>
          <div className="avatar-custom__options" role="radiogroup" aria-label="Color palette selection">
            {COLOR_PALETTES.map(p => (
              <button
                key={p.id}
                className={`avatar-custom__option avatar-custom__color ${palette === p.id ? 'selected' : ''}`}
                onClick={() => setPalette(p.id)}
                role="radio"
                aria-checked={palette === p.id}
                aria-label={p.label}
              >
                <span className="avatar-custom__swatch" style={{ backgroundColor: p.color }} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Cosmetics */}
        {availableCosmetics.length > 0 && (
          <section className="avatar-custom__section">
            <h3>Accessories</h3>
            <div className="avatar-custom__options" role="group" aria-label="Cosmetic items">
              {COSMETICS.map(cosmetic => {
                const isUnlocked = cosmetic.unlockLevel <= playerLevel || unlockedCosmetics.includes(cosmetic.id);
                const isSelected = selectedCosmetics.includes(cosmetic.id);
                return (
                  <button
                    key={cosmetic.id}
                    className={`avatar-custom__option ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`}
                    onClick={() => isUnlocked && toggleCosmetic(cosmetic.id)}
                    disabled={!isUnlocked}
                    aria-label={`${cosmetic.label}${!isUnlocked ? ' (locked - unlock at level ' + cosmetic.unlockLevel + ')' : ''}`}
                    aria-pressed={isSelected}
                  >
                    <span>{cosmetic.icon}</span>
                    <span className="avatar-custom__cosmetic-label">{cosmetic.label}</span>
                    {!isUnlocked && <span className="avatar-custom__lock">🔒 Lv{cosmetic.unlockLevel}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <button
          className="avatar-custom__confirm"
          onClick={handleConfirm}
          disabled={!canConfirm}
          aria-label={isInitialSetup ? 'Start exploring campus' : 'Save changes'}
        >
          {isInitialSetup ? 'Enter Campus →' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

export { BASE_STYLES, COLOR_PALETTES, COSMETICS };
export default AvatarCustomization;
