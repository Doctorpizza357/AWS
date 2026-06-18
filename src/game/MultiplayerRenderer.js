/**
 * MultiplayerRenderer
 * Renders other online players on the PixiJS campus canvas using the same
 * character art style as PlayerAvatar.
 * 
 * Features:
 * - Full character sprite (head, body, legs, hair, eyes) matching PlayerAvatar
 * - Smooth position interpolation (lerp) between Firestore updates
 * - Player name labels and level badges
 * - Walking bob animation when moving
 */
import * as PIXI from 'pixi.js';

const LERP_SPEED = 0.12;
const AVATAR_LENGTH = 28;

const PALETTE_COLORS = {
  blue: 0x4A90D9,
  red: 0xE74C3C,
  green: 0x27AE60,
  purple: 0x9B59B6,
};

function darken(color, amount) {
  const r = Math.max(0, ((color >> 16) & 0xFF) * (1 - amount));
  const g = Math.max(0, ((color >> 8) & 0xFF) * (1 - amount));
  const b = Math.max(0, (color & 0xFF) * (1 - amount));
  return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
}

function drawCharacter(graphics, palette, baseStyle) {
  graphics.clear();

  const color = PALETTE_COLORS[palette] || PALETTE_COLORS.blue;
  const darkerColor = darken(color, 0.3);

  // Body (tunic/shirt)
  graphics.beginFill(color);
  graphics.drawRoundedRect(-10, -2, 20, 18, 5);
  graphics.endFill();

  // Body accent
  graphics.beginFill(darkerColor, 0.4);
  graphics.drawRoundedRect(-8, 4, 16, 10, 3);
  graphics.endFill();

  // Head
  graphics.beginFill(0xFFDBAC);
  graphics.drawCircle(0, -10, 10);
  graphics.endFill();

  // Hair based on style
  const hairColor = baseStyle === 'style-a' ? 0x4A3728 : baseStyle === 'style-b' ? 0x1a1a1a : 0xD4A574;
  graphics.beginFill(hairColor);
  if (baseStyle === 'style-a') {
    graphics.drawEllipse(0, -18, 9, 5);
    graphics.moveTo(-7, -17);
    graphics.lineTo(-4, -24);
    graphics.lineTo(0, -18);
    graphics.lineTo(4, -25);
    graphics.lineTo(7, -17);
    graphics.closePath();
  } else if (baseStyle === 'style-b') {
    graphics.drawEllipse(0, -17, 10, 6);
    graphics.drawRect(-10, -16, 20, 4);
  } else {
    graphics.drawEllipse(0, -17, 9, 6);
    graphics.drawEllipse(-8, -10, 4, 8);
    graphics.drawEllipse(8, -10, 4, 8);
  }
  graphics.endFill();

  // Eyes
  graphics.beginFill(0xFFFFFF);
  graphics.drawCircle(-4, -10, 3.5);
  graphics.drawCircle(4, -10, 3.5);
  graphics.endFill();
  graphics.beginFill(0x333333);
  graphics.drawCircle(-3.5, -10, 2);
  graphics.drawCircle(4.5, -10, 2);
  graphics.endFill();
  // Eye shine
  graphics.beginFill(0xFFFFFF);
  graphics.drawCircle(-2.5, -11, 1);
  graphics.drawCircle(5.5, -11, 1);
  graphics.endFill();

  // Mouth
  graphics.lineStyle(1.5, 0xCC7755);
  graphics.arc(0, -6, 3, 0.2, Math.PI - 0.2);
  graphics.lineStyle(0);

  // Legs
  graphics.beginFill(0x4A4A6A);
  graphics.drawRoundedRect(-8, 16, 7, 10, 2);
  graphics.drawRoundedRect(1, 16, 7, 10, 2);
  graphics.endFill();

  // Shoes
  graphics.beginFill(darkerColor);
  graphics.drawRoundedRect(-9, 24, 9, 5, 2);
  graphics.drawRoundedRect(0, 24, 9, 5, 2);
  graphics.endFill();
}

class RemotePlayer {
  constructor(parentContainer, playerData) {
    this.uid = playerData.uid;
    this.container = new PIXI.Container();
    this.container.sortableChildren = true;

    // Target and current position
    this.targetX = playerData.position?.x || 0;
    this.targetY = playerData.position?.y || 0;
    this.container.x = this.targetX;
    this.container.y = this.targetY;

    // Shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.15);
    shadow.drawEllipse(0, AVATAR_LENGTH / 2 + 4, 14, 5);
    shadow.endFill();
    this.container.addChild(shadow);

    // Character sprite
    this.sprite = new PIXI.Graphics();
    const avatar = playerData.avatar || {};
    drawCharacter(this.sprite, avatar.palette || 'blue', avatar.baseStyle || 'style-a');
    this.container.addChild(this.sprite);

    // Level badge background
    const badgeBg = new PIXI.Graphics();
    badgeBg.beginFill(0x4A90D9);
    badgeBg.lineStyle(1, 0xFFFFFF, 0.8);
    badgeBg.drawRoundedRect(-14, -AVATAR_LENGTH - 16, 28, 14, 7);
    badgeBg.endFill();
    this.container.addChild(badgeBg);

    // Level badge text
    this.levelText = new PIXI.Text(`Lv${playerData.level || 1}`, {
      fontFamily: 'Arial',
      fontSize: 8,
      fill: 0xFFFFFF,
      fontWeight: 'bold',
    });
    this.levelText.anchor.set(0.5);
    this.levelText.position.set(0, -AVATAR_LENGTH - 8);
    this.container.addChild(this.levelText);

    // Name label
    const nameBg = new PIXI.Graphics();
    const name = playerData.displayName || 'Anonymous';
    nameBg.beginFill(0x000000, 0.5);
    nameBg.drawRoundedRect(-(name.length * 3.5 + 8), AVATAR_LENGTH + 2, name.length * 7 + 16, 14, 5);
    nameBg.endFill();
    this.container.addChild(nameBg);
    this.nameBg = nameBg;

    this.nameText = new PIXI.Text(name, {
      fontFamily: 'Arial',
      fontSize: 9,
      fill: 0xFFFFFF,
      fontWeight: '600',
    });
    this.nameText.anchor.set(0.5);
    this.nameText.position.set(0, AVATAR_LENGTH + 9);
    this.container.addChild(this.nameText);

    // Animation state
    this.isMoving = false;
    this.animTime = 0;

    // Depth sorting
    this.container._sortY = this.targetY;

    parentContainer.addChild(this.container);
  }

  update(playerData) {
    this.targetX = playerData.position?.x || this.targetX;
    this.targetY = playerData.position?.y || this.targetY;

    // Update level
    const lvl = `Lv${playerData.level || 1}`;
    if (this.levelText.text !== lvl) this.levelText.text = lvl;

    // Redraw character if avatar changed
    const avatar = playerData.avatar || {};
    drawCharacter(this.sprite, avatar.palette || 'blue', avatar.baseStyle || 'style-a');
  }

  tick(deltaMs) {
    const prevX = this.container.x;
    const prevY = this.container.y;

    // Lerp toward target
    this.container.x += (this.targetX - this.container.x) * LERP_SPEED;
    this.container.y += (this.targetY - this.container.y) * LERP_SPEED;

    // Update depth sort
    this.container._sortY = this.container.y;

    // Detect movement for bob animation
    const dx = this.container.x - prevX;
    const dy = this.container.y - prevY;
    this.isMoving = Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1;

    if (this.isMoving) {
      this.animTime += deltaMs * 0.008;
      this.sprite.y = Math.sin(this.animTime) * 2;
    } else {
      this.sprite.y = 0;
      this.animTime = 0;
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

export default class MultiplayerRenderer {
  constructor(worldContainer) {
    this.worldContainer = worldContainer;
    this.remotePlayers = new Map(); // uid → RemotePlayer
  }

  /**
   * Update the set of online players.
   */
  updatePlayers(onlinePlayers) {
    const currentUids = new Set(onlinePlayers.map(p => p.uid));

    // Remove players who went offline
    for (const [uid, rp] of this.remotePlayers) {
      if (!currentUids.has(uid)) {
        rp.destroy();
        this.remotePlayers.delete(uid);
      }
    }

    // Add or update players
    for (const player of onlinePlayers) {
      if (this.remotePlayers.has(player.uid)) {
        this.remotePlayers.get(player.uid).update(player);
      } else {
        const rp = new RemotePlayer(this.worldContainer, player);
        this.remotePlayers.set(player.uid, rp);
      }
    }
  }

  /**
   * Call on each game tick to interpolate positions smoothly.
   */
  tick(deltaMs) {
    for (const rp of this.remotePlayers.values()) {
      rp.tick(deltaMs);
    }
  }

  /**
   * Cleanup all remote player sprites.
   */
  destroy() {
    for (const rp of this.remotePlayers.values()) {
      rp.destroy();
    }
    this.remotePlayers.clear();
  }
}
