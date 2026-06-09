/**
 * CampusWorld - Polished 2D campus renderer with rich flat-vector visuals.
 * Inspired by Prodigy's clean, colorful illustration style.
 */
import * as PIXI from 'pixi.js';
import EventBus, { GameEvents } from './EventBus';
import campusConfig from '../data/campusConfig.json';

// Color helpers
const hex = (color) => parseInt(color.replace('#', ''), 16);

class CampusWorld {
  constructor(engine, config = campusConfig) {
    this._engine = engine;
    this._config = config;
    this._eventBus = EventBus.getInstance();
    this._worldContainer = new PIXI.Container();
    this._zoneContainers = {};
    this._buildingSprites = {};
    this._cameraTarget = null;
    this._currentZone = null;
    this._viewport = { width: 0, height: 0 };
    this._loadedChunks = new Set();
    this._allBuildings = [];

    this._collectAllBuildings();
  }

  get worldContainer() {
    return this._worldContainer;
  }

  get allBuildings() {
    return this._allBuildings;
  }

  get currentZone() {
    return this._currentZone;
  }

  _collectAllBuildings() {
    this._allBuildings = [];
    for (const zone of this._config.zones) {
      for (const building of zone.buildings) {
        this._allBuildings.push({ ...building, zone: zone.id });
      }
    }
    for (const building of this._config.specialBuildings) {
      this._allBuildings.push(building);
    }
  }

  initialize() {
    const { worldSize } = this._config;

    // Sky/grass base
    this._drawGround(worldSize);

    // Draw paths/roads connecting zones
    this._drawRoads();

    // Draw decorative elements (trees, bushes, flowers)
    this._drawDecorations(worldSize);

    // Create zones with rich visuals
    this._loadZones();

    // Add to engine stage
    this._engine.addToStage(this._worldContainer);
  }

  _drawGround(worldSize) {
    const ground = new PIXI.Graphics();

    // Base grass - gradient effect via multiple rects
    ground.beginFill(0x7EC850);
    ground.drawRect(0, 0, worldSize.width, worldSize.height);
    ground.endFill();

    // Subtle grass texture pattern
    ground.beginFill(0x6DB844, 0.3);
    for (let x = 0; x < worldSize.width; x += 80) {
      for (let y = 0; y < worldSize.height; y += 80) {
        const offsetX = (y % 160 === 0) ? 40 : 0;
        ground.drawCircle(x + offsetX + Math.random() * 20, y + Math.random() * 20, 15 + Math.random() * 10);
      }
    }
    ground.endFill();

    // Lighter grass patches
    ground.beginFill(0x8FD960, 0.25);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * worldSize.width;
      const y = Math.random() * worldSize.height;
      ground.drawEllipse(x, y, 40 + Math.random() * 60, 25 + Math.random() * 40);
    }
    ground.endFill();

    this._worldContainer.addChild(ground);
  }

  _drawRoads() {
    const roads = new PIXI.Graphics();

    // Main campus road - stone path style
    roads.beginFill(0xD4C5A9);
    // Horizontal main road
    roads.drawRoundedRect(100, 1100, 3000, 60, 8);
    // Vertical connector
    roads.drawRoundedRect(1550, 200, 60, 2000, 8);
    // Branches to zones
    roads.drawRoundedRect(300, 400, 800, 40, 6);
    roads.drawRoundedRect(1200, 400, 600, 40, 6);
    roads.drawRoundedRect(2200, 400, 800, 40, 6);
    roads.drawRoundedRect(400, 1400, 700, 40, 6);
    roads.drawRoundedRect(1800, 1400, 1000, 40, 6);
    roads.endFill();

    // Road border/shadow
    roads.lineStyle(2, 0xB8A88A, 0.5);
    roads.drawRoundedRect(100, 1100, 3000, 60, 8);
    roads.drawRoundedRect(1550, 200, 60, 2000, 8);

    // Cobblestone pattern on main roads
    roads.beginFill(0xC4B599, 0.4);
    for (let x = 120; x < 3080; x += 30) {
      roads.drawRoundedRect(x, 1108, 22, 14, 3);
      roads.drawRoundedRect(x + 12, 1130, 22, 14, 3);
    }
    roads.endFill();

    this._worldContainer.addChild(roads);
  }

  _drawDecorations(worldSize) {
    const decor = new PIXI.Container();

    // Trees scattered around
    const treePositions = [
      { x: 50, y: 200 }, { x: 150, y: 800 }, { x: 900, y: 150 },
      { x: 2000, y: 100 }, { x: 2900, y: 300 }, { x: 3100, y: 800 },
      { x: 100, y: 1600 }, { x: 600, y: 2000 }, { x: 1400, y: 2200 },
      { x: 2800, y: 1800 }, { x: 3000, y: 2100 }, { x: 1900, y: 200 },
      { x: 500, y: 600 }, { x: 2500, y: 600 }, { x: 700, y: 1200 },
      { x: 2200, y: 2200 }, { x: 1100, y: 700 }, { x: 3000, y: 1300 },
    ];

    treePositions.forEach(pos => {
      decor.addChild(this._createTree(pos.x, pos.y));
    });

    // Flower patches
    const flowerColors = [0xFF69B4, 0xFFD700, 0xFF6347, 0x9370DB, 0x00CED1];
    for (let i = 0; i < 40; i++) {
      const flower = new PIXI.Graphics();
      const color = flowerColors[i % flowerColors.length];
      const x = Math.random() * worldSize.width;
      const y = Math.random() * worldSize.height;
      flower.beginFill(color);
      flower.drawCircle(x, y, 3);
      flower.drawCircle(x + 4, y - 2, 3);
      flower.drawCircle(x - 4, y - 2, 3);
      flower.drawCircle(x + 2, y + 3, 3);
      flower.drawCircle(x - 2, y + 3, 3);
      flower.endFill();
      flower.beginFill(0xFFFF00);
      flower.drawCircle(x, y, 2);
      flower.endFill();
      decor.addChild(flower);
    }

    // Benches along paths
    const benchPositions = [
      { x: 500, y: 1080 }, { x: 1200, y: 1080 }, { x: 2400, y: 1080 },
    ];
    benchPositions.forEach(pos => {
      const bench = new PIXI.Graphics();
      bench.beginFill(0x8B4513);
      bench.drawRoundedRect(pos.x, pos.y, 50, 12, 3);
      bench.endFill();
      bench.beginFill(0x654321);
      bench.drawRect(pos.x + 5, pos.y + 12, 6, 10);
      bench.drawRect(pos.x + 39, pos.y + 12, 6, 10);
      bench.endFill();
      decor.addChild(bench);
    });

    // Lamp posts
    const lampPositions = [
      { x: 400, y: 1070 }, { x: 1000, y: 1070 }, { x: 1800, y: 1070 }, { x: 2600, y: 1070 },
    ];
    lampPositions.forEach(pos => {
      const lamp = new PIXI.Graphics();
      lamp.beginFill(0x333333);
      lamp.drawRect(pos.x, pos.y - 40, 4, 40);
      lamp.endFill();
      lamp.beginFill(0xFFD700, 0.8);
      lamp.drawCircle(pos.x + 2, pos.y - 46, 8);
      lamp.endFill();
      decor.addChild(lamp);
    });

    this._worldContainer.addChild(decor);
  }

  _createTree(x, y) {
    const tree = new PIXI.Graphics();
    // Trunk
    tree.beginFill(0x8B5E3C);
    tree.drawRoundedRect(x - 5, y - 10, 10, 25, 3);
    tree.endFill();
    // Canopy layers (depth effect)
    tree.beginFill(0x2D8B3E);
    tree.drawCircle(x, y - 25, 22);
    tree.endFill();
    tree.beginFill(0x3CA651);
    tree.drawCircle(x - 5, y - 30, 16);
    tree.drawCircle(x + 8, y - 22, 14);
    tree.endFill();
    tree.beginFill(0x4BBF62, 0.7);
    tree.drawCircle(x + 2, y - 35, 10);
    tree.endFill();
    return tree;
  }

  _loadZones() {
    for (const zone of this._config.zones) {
      const container = new PIXI.Container();
      container.position.set(zone.bounds.x, zone.bounds.y);

      // Zone ground - distinct colored area
      const zoneBg = new PIXI.Graphics();
      const baseColor = hex(zone.palette[0]);
      zoneBg.beginFill(baseColor, 0.08);
      zoneBg.drawRoundedRect(10, 10, zone.bounds.width - 20, zone.bounds.height - 20, 30);
      zoneBg.endFill();

      // Zone border (subtle)
      zoneBg.lineStyle(2, baseColor, 0.2);
      zoneBg.drawRoundedRect(10, 10, zone.bounds.width - 20, zone.bounds.height - 20, 30);

      container.addChild(zoneBg);

      // Zone sign/banner
      const signBg = new PIXI.Graphics();
      signBg.beginFill(baseColor, 0.85);
      signBg.drawRoundedRect(20, 15, zone.label.length * 12 + 30, 32, 12);
      signBg.endFill();
      container.addChild(signBg);

      const label = new PIXI.Text(zone.label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: 16,
        fill: 0xFFFFFF,
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowDistance: 1,
        dropShadowColor: 0x000000,
        dropShadowAlpha: 0.3,
      });
      label.position.set(35, 21);
      container.addChild(label);

      // Buildings in this zone
      for (const building of zone.buildings) {
        const buildingSprite = this._createBuilding(building, zone);
        buildingSprite.position.set(
          building.position.x - zone.bounds.x,
          building.position.y - zone.bounds.y
        );
        container.addChild(buildingSprite);
        this._buildingSprites[building.id] = buildingSprite;
      }

      this._zoneContainers[zone.id] = container;
      this._worldContainer.addChild(container);
    }

    // Special buildings (larger, distinctive)
    for (const building of this._config.specialBuildings) {
      const buildingSprite = this._createSpecialBuilding(building);
      buildingSprite.position.set(building.position.x, building.position.y);
      this._worldContainer.addChild(buildingSprite);
      this._buildingSprites[building.id] = buildingSprite;
    }

    // NPCs
    for (const npc of this._config.npcs) {
      const npcSprite = this._createNPC(npc);
      npcSprite.position.set(npc.position.x, npc.position.y);
      this._worldContainer.addChild(npcSprite);
    }
  }

  _createBuilding(building, zone) {
    const container = new PIXI.Container();
    const color1 = hex(zone.palette[1] || '#4A90D9');
    const color2 = hex(zone.palette[2] || '#6BB5E0');
    const roofColor = hex(zone.palette[3] || '#E85D04');

    // Shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.1);
    shadow.drawEllipse(5, 35, 45, 12);
    shadow.endFill();
    container.addChild(shadow);

    // Building body
    const body = new PIXI.Graphics();
    body.beginFill(color1);
    body.drawRoundedRect(-40, -50, 80, 75, 6);
    body.endFill();

    // Wall detail/gradient effect
    body.beginFill(color2, 0.3);
    body.drawRoundedRect(-38, -48, 76, 35, 4);
    body.endFill();

    // Windows (2 rows)
    body.beginFill(0xFFF8DC);
    body.drawRoundedRect(-28, -40, 16, 14, 2);
    body.drawRoundedRect(12, -40, 16, 14, 2);
    body.drawRoundedRect(-28, -18, 16, 14, 2);
    body.drawRoundedRect(12, -18, 16, 14, 2);
    body.endFill();

    // Window frames
    body.lineStyle(1, 0x666666, 0.5);
    body.drawRoundedRect(-28, -40, 16, 14, 2);
    body.drawRoundedRect(12, -40, 16, 14, 2);
    body.drawRoundedRect(-28, -18, 16, 14, 2);
    body.drawRoundedRect(12, -18, 16, 14, 2);

    // Door
    body.lineStyle(0);
    body.beginFill(0x654321);
    body.drawRoundedRect(-8, 2, 16, 22, 3);
    body.endFill();
    body.beginFill(0xFFD700);
    body.drawCircle(5, 14, 2);
    body.endFill();

    // Roof
    body.beginFill(roofColor);
    body.moveTo(-48, -50);
    body.lineTo(0, -80);
    body.lineTo(48, -50);
    body.closePath();
    body.endFill();

    // Roof accent line
    body.lineStyle(2, 0xFFFFFF, 0.3);
    body.moveTo(-44, -52);
    body.lineTo(0, -76);
    body.lineTo(44, -52);

    container.addChild(body);

    // Icon badge
    const iconBg = new PIXI.Graphics();
    iconBg.beginFill(0xFFFFFF, 0.9);
    iconBg.drawCircle(30, -60, 12);
    iconBg.endFill();
    iconBg.lineStyle(2, roofColor);
    iconBg.drawCircle(30, -60, 12);
    container.addChild(iconBg);

    const iconText = new PIXI.Text(building.icon || '🏢', {
      fontSize: 12,
    });
    iconText.anchor.set(0.5);
    iconText.position.set(30, -60);
    container.addChild(iconText);

    // Label below building
    const labelBg = new PIXI.Graphics();
    labelBg.beginFill(0x000000, 0.6);
    labelBg.drawRoundedRect(-50, 38, 100, 20, 8);
    labelBg.endFill();
    container.addChild(labelBg);

    const nameLabel = new PIXI.Text(building.label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 9,
      fill: 0xFFFFFF,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: 95,
    });
    nameLabel.anchor.set(0.5);
    nameLabel.position.set(0, 48);
    container.addChild(nameLabel);

    container.interactive = true;
    container.buttonMode = true;
    container._buildingData = building;

    return container;
  }

  _createSpecialBuilding(building) {
    const container = new PIXI.Container();

    // Shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.12);
    shadow.drawEllipse(5, 45, 60, 15);
    shadow.endFill();
    container.addChild(shadow);

    // Building body - larger, more grand
    const body = new PIXI.Graphics();
    body.beginFill(0x3D5A80);
    body.drawRoundedRect(-55, -65, 110, 95, 8);
    body.endFill();

    // Facade detail
    body.beginFill(0x4A7BAF, 0.4);
    body.drawRoundedRect(-50, -60, 100, 45, 5);
    body.endFill();

    // Columns
    body.beginFill(0xD4C5A9);
    body.drawRoundedRect(-48, -20, 8, 50, 2);
    body.drawRoundedRect(-28, -20, 8, 50, 2);
    body.drawRoundedRect(20, -20, 8, 50, 2);
    body.drawRoundedRect(40, -20, 8, 50, 2);
    body.endFill();

    // Windows (larger, arched)
    body.beginFill(0xFFF8DC);
    body.drawRoundedRect(-40, -55, 20, 18, 4);
    body.drawRoundedRect(-10, -55, 20, 18, 4);
    body.drawRoundedRect(20, -55, 20, 18, 4);
    body.endFill();

    // Grand door
    body.beginFill(0x8B4513);
    body.drawRoundedRect(-12, 0, 24, 30, 4);
    body.endFill();
    body.beginFill(0xFFD700);
    body.drawCircle(-4, 16, 2.5);
    body.drawCircle(4, 16, 2.5);
    body.endFill();

    // Roof / pediment
    body.beginFill(0x2C4A6E);
    body.moveTo(-60, -65);
    body.lineTo(0, -95);
    body.lineTo(60, -65);
    body.closePath();
    body.endFill();

    // Gold trim
    body.lineStyle(2, 0xFFD700, 0.8);
    body.moveTo(-55, -65);
    body.lineTo(0, -90);
    body.lineTo(55, -65);
    body.drawRoundedRect(-55, -65, 110, 95, 8);

    container.addChild(body);

    // Icon badge (larger)
    const iconBg = new PIXI.Graphics();
    iconBg.beginFill(0xFFD700);
    iconBg.drawCircle(0, -85, 16);
    iconBg.endFill();
    iconBg.lineStyle(2, 0xFFFFFF);
    iconBg.drawCircle(0, -85, 16);
    container.addChild(iconBg);

    const iconText = new PIXI.Text(building.icon || '🏛️', {
      fontSize: 16,
    });
    iconText.anchor.set(0.5);
    iconText.position.set(0, -85);
    container.addChild(iconText);

    // Name plate
    const plateBg = new PIXI.Graphics();
    plateBg.beginFill(0x1a1a2e, 0.85);
    plateBg.drawRoundedRect(-60, 42, 120, 24, 10);
    plateBg.endFill();
    plateBg.lineStyle(1, 0xFFD700, 0.6);
    plateBg.drawRoundedRect(-60, 42, 120, 24, 10);
    container.addChild(plateBg);

    const nameLabel = new PIXI.Text(building.label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fill: 0xFFFFFF,
      fontWeight: 'bold',
      align: 'center',
    });
    nameLabel.anchor.set(0.5);
    nameLabel.position.set(0, 54);
    container.addChild(nameLabel);

    container.interactive = true;
    container.buttonMode = true;
    container._buildingData = building;

    return container;
  }

  _createNPC(npc) {
    const container = new PIXI.Container();

    // Shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.15);
    shadow.drawEllipse(0, 18, 12, 5);
    shadow.endFill();
    container.addChild(shadow);

    // Body
    const body = new PIXI.Graphics();
    // Torso
    body.beginFill(0x5B86E5);
    body.drawRoundedRect(-10, -5, 20, 20, 6);
    body.endFill();
    // Head
    body.beginFill(0xFFDBAC);
    body.drawCircle(0, -14, 11);
    body.endFill();
    // Hair
    body.beginFill(0x4A3728);
    body.drawEllipse(0, -20, 10, 6);
    body.endFill();
    // Eyes
    body.beginFill(0x333333);
    body.drawCircle(-4, -14, 2);
    body.drawCircle(4, -14, 2);
    body.endFill();
    // Smile
    body.lineStyle(1.5, 0xCC7755);
    body.arc(0, -10, 4, 0, Math.PI);

    container.addChild(body);

    // Speech indicator (floating "!")
    const indicator = new PIXI.Graphics();
    indicator.beginFill(0xFFD700);
    indicator.drawRoundedRect(-5, -35, 10, 14, 4);
    indicator.endFill();
    indicator.beginFill(0xFFFFFF);
    indicator.drawRect(-1.5, -33, 3, 7);
    indicator.drawCircle(0, -23, 2);
    indicator.endFill();
    container.addChild(indicator);

    // Name tag
    const nameBg = new PIXI.Graphics();
    nameBg.beginFill(0x000000, 0.5);
    nameBg.drawRoundedRect(-(npc.label.length * 3.5 + 8), 22, npc.label.length * 7 + 16, 16, 6);
    nameBg.endFill();
    container.addChild(nameBg);

    const nameText = new PIXI.Text(npc.label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 9,
      fill: 0xFFFFFF,
      align: 'center',
    });
    nameText.anchor.set(0.5);
    nameText.position.set(0, 30);
    container.addChild(nameText);

    container.interactive = true;
    container.buttonMode = true;
    container._npcData = npc;

    return container;
  }

  setViewport(width, height) {
    this._viewport = { width, height };
  }

  setCameraTarget(entity) {
    this._cameraTarget = entity;
  }

  updateCamera() {
    if (!this._cameraTarget) return;
    const pos = this._cameraTarget.getPosition();
    const { width, height } = this._viewport;

    const targetX = -(pos.x - width / 2);
    const targetY = -(pos.y - height / 2);

    const { worldSize } = this._config;
    this._worldContainer.position.x = Math.min(0, Math.max(targetX, -(worldSize.width - width)));
    this._worldContainer.position.y = Math.min(0, Math.max(targetY, -(worldSize.height - height)));

    this._checkZoneChange(pos);
  }

  _checkZoneChange(playerPos) {
    for (const zone of this._config.zones) {
      const { bounds } = zone;
      if (
        playerPos.x >= bounds.x &&
        playerPos.x <= bounds.x + bounds.width &&
        playerPos.y >= bounds.y &&
        playerPos.y <= bounds.y + bounds.height
      ) {
        if (this._currentZone !== zone.id) {
          const previousZone = this._currentZone;
          this._currentZone = zone.id;
          this._eventBus.emit(GameEvents.ZONE_CHANGED, {
            previousZone,
            currentZone: zone.id,
            palette: zone.palette,
          });
        }
        return;
      }
    }
  }

  getZoneAtPosition(x, y) {
    for (const zone of this._config.zones) {
      const { bounds } = zone;
      if (x >= bounds.x && x <= bounds.x + bounds.width &&
          y >= bounds.y && y <= bounds.y + bounds.height) {
        return zone;
      }
    }
    return null;
  }

  getZonePalette(zoneId) {
    const zone = this._config.zones.find(z => z.id === zoneId);
    return zone ? zone.palette : null;
  }

  getBuildingsInZone(zoneId) {
    const zone = this._config.zones.find(z => z.id === zoneId);
    return zone ? zone.buildings : [];
  }

  getBuildingById(buildingId) {
    return this._allBuildings.find(b => b.id === buildingId) || null;
  }

  getBuildingPosition(buildingId) {
    const building = this.getBuildingById(buildingId);
    return building ? building.position : null;
  }

  setExploredState(buildingId, explored) {
    const sprite = this._buildingSprites[buildingId];
    if (sprite) {
      sprite.alpha = explored ? 1.0 : 0.7;
    }
  }

  loadVisibleChunks(center, radius) {
    const chunkSize = 400;
    const cx = Math.floor(center.x / chunkSize);
    const cy = Math.floor(center.y / chunkSize);
    const r = Math.ceil(radius / chunkSize);

    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const chunkId = `${cx + dx}_${cy + dy}`;
        this._loadedChunks.add(chunkId);
      }
    }
  }

  unloadDistantChunks(center, radius) {
    const chunkSize = 400;
    const cx = Math.floor(center.x / chunkSize);
    const cy = Math.floor(center.y / chunkSize);
    const maxR = Math.ceil(radius / chunkSize) + 2;

    for (const chunkId of this._loadedChunks) {
      const [chunkX, chunkY] = chunkId.split('_').map(Number);
      if (Math.abs(chunkX - cx) > maxR || Math.abs(chunkY - cy) > maxR) {
        this._loadedChunks.delete(chunkId);
      }
    }
  }

  getLoadedChunks() {
    return [...this._loadedChunks];
  }

  getNPCs() {
    return this._config.npcs;
  }

  getNPCById(npcId) {
    return this._config.npcs.find(n => n.id === npcId) || null;
  }
}

export default CampusWorld;
