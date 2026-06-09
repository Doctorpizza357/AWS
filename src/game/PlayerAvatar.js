/**
 * PlayerAvatar - Handles avatar rendering, movement, customization, and proximity detection.
 */
import * as PIXI from 'pixi.js';
import EventBus, { GameEvents } from './EventBus';
import campusConfig from '../data/campusConfig.json';

const AVATAR_LENGTH = campusConfig.avatarLength; // 32px
const INTERACTION_RADIUS = AVATAR_LENGTH * 2; // 64px
const MOVE_SPEED = 3;
const ANIMATION_FRAMES = 12;
const ANIMATION_FPS = 24;

class PlayerAvatar {
  constructor(world, config = {}) {
    this._world = world;
    this._eventBus = EventBus.getInstance();
    this._position = { x: config.x || campusConfig.spawnPoint.x, y: config.y || campusConfig.spawnPoint.y };
    this._appearance = {
      baseStyle: config.baseStyle || 'style-a',
      palette: config.palette || 'blue',
      cosmetics: config.cosmetics || [],
      level: config.level || 1,
    };
    this._container = new PIXI.Container();
    this._sprite = null;
    this._direction = 'idle';
    this._animFrame = 0;
    this._animTimer = 0;
    this._keys = { up: false, down: false, left: false, right: false };
    this._nearbyBuilding = null;

    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);

    this._createSprite();
    this._setupInput();
  }

  get container() {
    return this._container;
  }

  getPosition() {
    return { ...this._position };
  }

  setPosition(x, y) {
    this._position.x = x;
    this._position.y = y;
    this._container.position.set(x, y);
    this._eventBus.emit(GameEvents.AVATAR_MOVED, { x, y });
  }

  getAppearance() {
    return { ...this._appearance };
  }

  setAppearance(config) {
    this._appearance = { ...this._appearance, ...config };
    this._updateSprite();
  }

  setLevelBadge(level) {
    this._appearance.level = level;
    this._updateSprite();
  }

  getInteractionRadius() {
    return INTERACTION_RADIUS;
  }

  isInRangeOf(entity) {
    const pos = entity.position || entity;
    const dx = this._position.x - pos.x;
    const dy = this._position.y - pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const radius = entity.interactionRadius || INTERACTION_RADIUS;
    return distance <= radius;
  }

  static checkProximity(playerPos, entityPos, radius) {
    const dx = playerPos.x - entityPos.x;
    const dy = playerPos.y - entityPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= radius;
  }

  update(delta) {
    const moving = this._keys.up || this._keys.down || this._keys.left || this._keys.right;

    if (moving) {
      const speed = MOVE_SPEED * delta;
      let dx = 0;
      let dy = 0;

      if (this._keys.up) dy -= speed;
      if (this._keys.down) dy += speed;
      if (this._keys.left) dx -= speed;
      if (this._keys.right) dx += speed;

      // Normalize diagonal movement
      if (dx !== 0 && dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dx = (dx / len) * speed;
        dy = (dy / len) * speed;
      }

      // Clamp to world bounds
      const { worldSize } = campusConfig;
      const newX = Math.max(AVATAR_LENGTH, Math.min(worldSize.width - AVATAR_LENGTH, this._position.x + dx));
      const newY = Math.max(AVATAR_LENGTH, Math.min(worldSize.height - AVATAR_LENGTH, this._position.y + dy));

      this._position.x = newX;
      this._position.y = newY;
      this._container.position.set(newX, newY);

      // Determine direction for animation
      if (Math.abs(dx) > Math.abs(dy)) {
        this._direction = dx > 0 ? 'right' : 'left';
      } else {
        this._direction = dy > 0 ? 'down' : 'up';
      }

      this._eventBus.emit(GameEvents.AVATAR_MOVED, { x: newX, y: newY });
      this._checkBuildingProximity();
    } else {
      this._direction = 'idle';
    }

    // Update animation
    this._updateAnimation(delta);
  }

  _createSprite() {
    this._sprite = new PIXI.Graphics();
    this._updateSprite();
    this._container.addChild(this._sprite);
    this._container.position.set(this._position.x, this._position.y);

    // Level badge
    this._levelBadge = new PIXI.Text(`Lv${this._appearance.level}`, {
      fontFamily: 'Arial',
      fontSize: 8,
      fill: 0xFFFFFF,
      fontWeight: 'bold',
    });
    this._levelBadge.anchor.set(0.5);
    this._levelBadge.position.set(0, -AVATAR_LENGTH - 8);

    const badgeBg = new PIXI.Graphics();
    badgeBg.beginFill(0x4A90D9);
    badgeBg.lineStyle(1, 0xFFFFFF, 0.8);
    badgeBg.drawRoundedRect(-14, -AVATAR_LENGTH - 16, 28, 14, 7);
    badgeBg.endFill();
    this._container.addChild(badgeBg);
    this._container.addChild(this._levelBadge);
    this._badgeBg = badgeBg;

    // Name/shadow under avatar
    const avatarShadow = new PIXI.Graphics();
    avatarShadow.beginFill(0x000000, 0.15);
    avatarShadow.drawEllipse(0, AVATAR_LENGTH / 2 + 4, 14, 5);
    avatarShadow.endFill();
    this._container.addChildAt(avatarShadow, 0);
  }

  _updateSprite() {
    if (!this._sprite) return;
    this._sprite.clear();

    const paletteColors = {
      blue: 0x4A90D9,
      red: 0xE74C3C,
      green: 0x27AE60,
      purple: 0x9B59B6,
    };

    const color = paletteColors[this._appearance.palette] || 0x4A90D9;
    const darkerColor = this._darken(color, 0.3);

    // Body (tunic/shirt)
    this._sprite.beginFill(color);
    this._sprite.drawRoundedRect(-10, -2, 20, 18, 5);
    this._sprite.endFill();

    // Body accent
    this._sprite.beginFill(darkerColor, 0.4);
    this._sprite.drawRoundedRect(-8, 4, 16, 10, 3);
    this._sprite.endFill();

    // Head
    this._sprite.beginFill(0xFFDBAC);
    this._sprite.drawCircle(0, -10, 10);
    this._sprite.endFill();

    // Hair based on style
    const style = this._appearance.baseStyle;
    this._sprite.beginFill(style === 'style-a' ? 0x4A3728 : style === 'style-b' ? 0x1a1a1a : 0xD4A574);
    if (style === 'style-a') {
      // Spiky hair
      this._sprite.drawEllipse(0, -18, 9, 5);
      this._sprite.moveTo(-7, -17);
      this._sprite.lineTo(-4, -24);
      this._sprite.lineTo(0, -18);
      this._sprite.lineTo(4, -25);
      this._sprite.lineTo(7, -17);
      this._sprite.closePath();
    } else if (style === 'style-b') {
      // Neat cap/short hair
      this._sprite.drawEllipse(0, -17, 10, 6);
      this._sprite.drawRect(-10, -16, 20, 4);
    } else {
      // Long/flowing
      this._sprite.drawEllipse(0, -17, 9, 6);
      this._sprite.drawEllipse(-8, -10, 4, 8);
      this._sprite.drawEllipse(8, -10, 4, 8);
    }
    this._sprite.endFill();

    // Eyes
    this._sprite.beginFill(0xFFFFFF);
    this._sprite.drawCircle(-4, -10, 3.5);
    this._sprite.drawCircle(4, -10, 3.5);
    this._sprite.endFill();
    this._sprite.beginFill(0x333333);
    this._sprite.drawCircle(-3.5, -10, 2);
    this._sprite.drawCircle(4.5, -10, 2);
    this._sprite.endFill();
    // Eye shine
    this._sprite.beginFill(0xFFFFFF);
    this._sprite.drawCircle(-2.5, -11, 1);
    this._sprite.drawCircle(5.5, -11, 1);
    this._sprite.endFill();

    // Mouth
    this._sprite.lineStyle(1.5, 0xCC7755);
    this._sprite.arc(0, -6, 3, 0.2, Math.PI - 0.2);
    this._sprite.lineStyle(0);

    // Legs
    this._sprite.beginFill(0x4A4A6A);
    this._sprite.drawRoundedRect(-8, 16, 7, 10, 2);
    this._sprite.drawRoundedRect(1, 16, 7, 10, 2);
    this._sprite.endFill();

    // Shoes
    this._sprite.beginFill(darkerColor);
    this._sprite.drawRoundedRect(-9, 24, 9, 5, 2);
    this._sprite.drawRoundedRect(0, 24, 9, 5, 2);
    this._sprite.endFill();

    // Update level badge
    if (this._levelBadge) {
      this._levelBadge.text = `Lv${this._appearance.level}`;
    }
  }

  _darken(color, amount) {
    const r = Math.max(0, ((color >> 16) & 0xFF) * (1 - amount));
    const g = Math.max(0, ((color >> 8) & 0xFF) * (1 - amount));
    const b = Math.max(0, (color & 0xFF) * (1 - amount));
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
  }

  _updateAnimation(delta) {
    if (this._direction === 'idle') return;
    this._animTimer += delta;
    const frameTime = 60 / ANIMATION_FPS;
    if (this._animTimer >= frameTime) {
      this._animTimer = 0;
      this._animFrame = (this._animFrame + 1) % ANIMATION_FRAMES;
      // Simple bounce animation
      const bounce = Math.sin((this._animFrame / ANIMATION_FRAMES) * Math.PI * 2) * 2;
      this._sprite.position.y = bounce;
    }
  }

  _checkBuildingProximity() {
    const buildings = this._world.allBuildings;
    let nearestBuilding = null;
    let nearestDist = Infinity;

    for (const building of buildings) {
      const dx = this._position.x - building.position.x;
      const dy = this._position.y - building.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = building.interactionRadius || INTERACTION_RADIUS;

      if (dist <= radius && dist < nearestDist) {
        nearestDist = dist;
        nearestBuilding = building;
      }
    }

    if (nearestBuilding !== this._nearbyBuilding) {
      this._nearbyBuilding = nearestBuilding;
      this._eventBus.emit(GameEvents.BUILDING_PROXIMITY, {
        building: nearestBuilding,
        inRange: !!nearestBuilding,
      });
    }
  }

  _setupInput() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('keyup', this._handleKeyUp);
  }

  _handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': this._keys.up = true; break;
      case 'ArrowDown': case 's': case 'S': this._keys.down = true; break;
      case 'ArrowLeft': case 'a': case 'A': this._keys.left = true; break;
      case 'ArrowRight': case 'd': case 'D': this._keys.right = true; break;
      default: break;
    }
  }

  _handleKeyUp(e) {
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': this._keys.up = false; break;
      case 'ArrowDown': case 's': case 'S': this._keys.down = false; break;
      case 'ArrowLeft': case 'a': case 'A': this._keys.left = false; break;
      case 'ArrowRight': case 'd': case 'D': this._keys.right = false; break;
      default: break;
    }
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._handleKeyDown);
      window.removeEventListener('keyup', this._handleKeyUp);
    }
    if (this._container.parent) {
      this._container.parent.removeChild(this._container);
    }
    this._container.destroy({ children: true });
  }
}

export default PlayerAvatar;
