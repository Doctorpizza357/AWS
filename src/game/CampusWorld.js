/**
 * CampusWorld - Realistic isometric campus renderer with depth, lighting, and polish.
 * Features: isometric buildings, realistic shadows, depth sorting, detailed ground/roads,
 * water feature with animated ripples, global sun lighting, zoom-on-approach.
 */
import * as PIXI from 'pixi.js';
import EventBus, { GameEvents } from './EventBus';
import campusConfig from '../data/campusConfig.json';

// ─── Helpers ────────────────────────────────────────────────────────────────
const hex = (color) => parseInt(color.replace('#', ''), 16);
const darken = (color, factor = 0.7) => {
  const r = Math.floor(((color >> 16) & 0xFF) * factor);
  const g = Math.floor(((color >> 8) & 0xFF) * factor);
  const b = Math.floor((color & 0xFF) * factor);
  return (r << 16) | (g << 8) | b;
};
const lighten = (color, factor = 1.3) => {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xFF) * factor));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xFF) * factor));
  const b = Math.min(255, Math.floor((color & 0xFF) * factor));
  return (r << 16) | (g << 8) | b;
};

// ─── Global Sun / Lighting Config ───────────────────────────────────────────
const SUN = {
  angle: Math.PI / 4,       // 45 degrees from top-right
  shadowOffsetX: 12,
  shadowOffsetY: 8,
  shadowAlpha: 0.18,
  litFaceBrightness: 1.15,  // right face gets more light
  shadedFaceBrightness: 0.7, // left face is darker
  topFaceBrightness: 1.0,
};

// ─── Isometric helpers ──────────────────────────────────────────────────────
const ISO_SKEW = 0.35; // how much horizontal skew for depth
const ISO_DEPTH = 0.5; // vertical compression for side face

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
    this._depthSortables = [];
    this._animatedObjects = [];
    this._zoomTweens = new Map();
    this._time = 0;

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

    // Ground layers (gradient grass, dirt patches)
    this._drawGround(worldSize);

    // Roads with lane markings and crosswalks
    this._drawRoads();

    // Water feature (pond/fountain in center)
    this._drawWaterFeature();

    // Decorative elements (trees, flowers, benches, lamps)
    this._drawDecorations(worldSize);

    // Create zones with isometric buildings
    this._loadZones();

    // Enable zIndex-based sorting for the world container
    this._worldContainer.sortableChildren = true;

    // Initial depth sort
    this.sortByDepth();

    // Add to engine stage
    this._engine.addToStage(this._worldContainer);
  }

  // ─── GROUND ─────────────────────────────────────────────────────────────────

  _drawGround(worldSize) {
    const ground = new PIXI.Graphics();
    const w = worldSize.width;
    const h = worldSize.height;

    // Base gradient - multiple horizontal layers from darker to lighter
    const grassColors = [0x5A9E3A, 0x63A843, 0x6DB84D, 0x78C458, 0x7EC850, 0x86CF5A, 0x8FD960];
    const layerHeight = h / grassColors.length;
    grassColors.forEach((color, i) => {
      ground.beginFill(color);
      ground.drawRect(0, i * layerHeight, w, layerHeight + 1);
      ground.endFill();
    });

    // Subtle noise-like variation (small random dots)
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const shade = Math.random() > 0.5 ? 0x5DA03F : 0x8BD962;
      const alpha = 0.08 + Math.random() * 0.12;
      ground.beginFill(shade, alpha);
      ground.drawCircle(x, y, 3 + Math.random() * 8);
      ground.endFill();
    }

    // Dirt patches near roads
    const dirtPatches = [
      { x: 150, y: 1080, rx: 80, ry: 30 },
      { x: 600, y: 1090, rx: 60, ry: 25 },
      { x: 1550, y: 250, rx: 40, ry: 70 },
      { x: 1550, y: 1900, rx: 50, ry: 40 },
      { x: 2400, y: 1100, rx: 70, ry: 28 },
      { x: 900, y: 1100, rx: 55, ry: 22 },
      { x: 2000, y: 420, rx: 45, ry: 20 },
      { x: 1200, y: 1400, rx: 50, ry: 22 },
    ];
    dirtPatches.forEach(p => {
      ground.beginFill(0xB8A470, 0.25);
      ground.drawEllipse(p.x, p.y, p.rx, p.ry);
      ground.endFill();
      ground.beginFill(0xA0915E, 0.15);
      ground.drawEllipse(p.x + 5, p.y + 3, p.rx * 0.7, p.ry * 0.7);
      ground.endFill();
    });

    // Lighter grass patches for variety
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ground.beginFill(0x96E066, 0.12);
      ground.drawEllipse(x, y, 30 + Math.random() * 50, 18 + Math.random() * 30);
      ground.endFill();
    }

    // Darker grass clumps
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ground.beginFill(0x4A8B30, 0.1);
      ground.drawEllipse(x, y, 20 + Math.random() * 35, 12 + Math.random() * 20);
      ground.endFill();
    }

    this._worldContainer.addChild(ground);
  }

  // ─── ROADS ──────────────────────────────────────────────────────────────────

  _drawRoads() {
    const roads = new PIXI.Graphics();

    // Road definitions (x, y, w, h, isHorizontal)
    const roadDefs = [
      { x: 80, y: 1090, w: 3050, h: 70, horizontal: true },   // Main horizontal
      { x: 1540, y: 180, w: 70, h: 2050, horizontal: false },  // Main vertical
      { x: 280, y: 390, w: 820, h: 50, horizontal: true },     // Branch to tech
      { x: 1180, y: 390, w: 620, h: 50, horizontal: true },    // Branch to engineering
      { x: 2180, y: 390, w: 820, h: 50, horizontal: true },    // Branch to science
      { x: 380, y: 1390, w: 720, h: 50, horizontal: true },    // Branch to health
      { x: 1780, y: 1390, w: 1020, h: 50, horizontal: true },  // Branch to creative
    ];

    // Draw road base (asphalt)
    roadDefs.forEach(rd => {
      // Road shadow
      roads.beginFill(0x000000, 0.06);
      roads.drawRoundedRect(rd.x + 4, rd.y + 4, rd.w, rd.h, 6);
      roads.endFill();

      // Main road surface
      roads.beginFill(0x6B6B6B);
      roads.drawRoundedRect(rd.x, rd.y, rd.w, rd.h, 6);
      roads.endFill();

      // Road edge/curb
      roads.beginFill(0x888888);
      roads.drawRoundedRect(rd.x, rd.y, rd.w, 3, 2);
      roads.drawRoundedRect(rd.x, rd.y + rd.h - 3, rd.w, 3, 2);
      roads.endFill();

      // Sidewalk strip
      roads.beginFill(0xC8BFA0, 0.6);
      if (rd.horizontal) {
        roads.drawRect(rd.x, rd.y - 8, rd.w, 8);
        roads.drawRect(rd.x, rd.y + rd.h, rd.w, 8);
      } else {
        roads.drawRect(rd.x - 8, rd.y, 8, rd.h);
        roads.drawRect(rd.x + rd.w, rd.y, 8, rd.h);
      }
      roads.endFill();
    });

    // Lane markings (dashed center lines)
    roads.beginFill(0xFFFFFF, 0.8);
    roadDefs.forEach(rd => {
      if (rd.horizontal) {
        const cy = rd.y + rd.h / 2 - 1.5;
        for (let x = rd.x + 20; x < rd.x + rd.w - 20; x += 40) {
          roads.drawRoundedRect(x, cy, 24, 3, 1);
        }
      } else {
        const cx = rd.x + rd.w / 2 - 1.5;
        for (let y = rd.y + 20; y < rd.y + rd.h - 20; y += 40) {
          roads.drawRoundedRect(cx, y, 3, 24, 1);
        }
      }
    });
    roads.endFill();

    // Crosswalks near buildings/intersections
    const crosswalks = [
      { x: 1540, y: 1090, vertical: true },  // Main intersection
      { x: 1540, y: 390, vertical: true },    // North intersection
      { x: 400, y: 1090, vertical: true },    // West crossing
      { x: 2400, y: 1090, vertical: true },   // East crossing
    ];
    crosswalks.forEach(cw => {
      roads.beginFill(0xFFFFFF, 0.85);
      if (cw.vertical) {
        for (let i = 0; i < 6; i++) {
          roads.drawRect(cw.x - 30 + i * 11, cw.y - 5, 8, 70);
        }
      } else {
        for (let i = 0; i < 6; i++) {
          roads.drawRect(cw.x - 5, cw.y - 30 + i * 11, 50, 8);
        }
      }
      roads.endFill();
    });

    // Rounded intersection patches
    const intersections = [
      { x: 1575, y: 1125 },
      { x: 1575, y: 415 },
    ];
    intersections.forEach(int => {
      roads.beginFill(0x5A5A5A);
      roads.drawCircle(int.x, int.y, 38);
      roads.endFill();
      // Center marking
      roads.beginFill(0xFFFFFF, 0.3);
      roads.drawCircle(int.x, int.y, 8);
      roads.endFill();
    });

    this._worldContainer.addChild(roads);
  }

  // ─── WATER FEATURE ──────────────────────────────────────────────────────────

  _drawWaterFeature() {
    const waterContainer = new PIXI.Container();
    const cx = 1600;
    const cy = 1000;

    // Pond base shadow
    const pondShadow = new PIXI.Graphics();
    pondShadow.beginFill(0x000000, 0.1);
    pondShadow.drawEllipse(cx + 5, cy + 5, 85, 55);
    pondShadow.endFill();
    waterContainer.addChild(pondShadow);

    // Stone border
    const border = new PIXI.Graphics();
    border.beginFill(0x8B8B7A);
    border.drawEllipse(cx, cy, 88, 58);
    border.endFill();
    border.beginFill(0xA0A090);
    border.drawEllipse(cx, cy, 83, 53);
    border.endFill();
    waterContainer.addChild(border);

    // Water body
    const water = new PIXI.Graphics();
    water.beginFill(0x4A90D9, 0.85);
    water.drawEllipse(cx, cy, 78, 48);
    water.endFill();
    // Lighter center
    water.beginFill(0x7ABAE6, 0.5);
    water.drawEllipse(cx, cy - 5, 50, 30);
    water.endFill();
    waterContainer.addChild(water);

    // Fountain center piece
    const fountain = new PIXI.Graphics();
    fountain.beginFill(0x6B6B6B);
    fountain.drawCircle(cx, cy, 10);
    fountain.endFill();
    fountain.beginFill(0x888888);
    fountain.drawCircle(cx, cy, 7);
    fountain.endFill();
    waterContainer.addChild(fountain);

    // Animated ripples (stored for update loop)
    const ripples = new PIXI.Graphics();
    waterContainer.addChild(ripples);
    this._animatedObjects.push({
      type: 'ripples',
      graphics: ripples,
      cx,
      cy,
      maxRadius: 70,
    });

    // Decorative lily pads
    const lilyPad = new PIXI.Graphics();
    lilyPad.beginFill(0x3D8B37, 0.7);
    lilyPad.drawEllipse(cx - 40, cy + 15, 10, 7);
    lilyPad.drawEllipse(cx + 35, cy - 10, 8, 6);
    lilyPad.drawEllipse(cx - 20, cy + 30, 9, 6);
    lilyPad.endFill();
    // Tiny flowers on pads
    lilyPad.beginFill(0xFFB6C1);
    lilyPad.drawCircle(cx - 40, cy + 14, 3);
    lilyPad.drawCircle(cx + 35, cy - 11, 2.5);
    lilyPad.endFill();
    waterContainer.addChild(lilyPad);

    waterContainer._sortY = cy + 48;
    this._depthSortables.push(waterContainer);
    this._worldContainer.addChild(waterContainer);
  }

  // ─── DECORATIONS ────────────────────────────────────────────────────────────

  _drawDecorations(worldSize) {
    // Trees scattered around
    const treePositions = [
      { x: 50, y: 200 }, { x: 150, y: 800 }, { x: 900, y: 150 },
      { x: 2000, y: 100 }, { x: 2900, y: 300 }, { x: 3100, y: 800 },
      { x: 100, y: 1600 }, { x: 600, y: 2000 }, { x: 1400, y: 2200 },
      { x: 2800, y: 1800 }, { x: 3000, y: 2100 }, { x: 1900, y: 200 },
      { x: 500, y: 600 }, { x: 2500, y: 600 }, { x: 700, y: 1200 },
      { x: 2200, y: 2200 }, { x: 1100, y: 700 }, { x: 3000, y: 1300 },
      { x: 350, y: 950 }, { x: 2700, y: 950 }, { x: 1900, y: 2100 },
      { x: 1050, y: 2050 }, { x: 3100, y: 1600 }, { x: 200, y: 2300 },
    ];

    treePositions.forEach(pos => {
      const tree = this._createTree(pos.x, pos.y);
      tree._sortY = pos.y + 15;
      this._depthSortables.push(tree);
      this._worldContainer.addChild(tree);
    });

    // Flower patches
    const flowerColors = [0xFF69B4, 0xFFD700, 0xFF6347, 0x9370DB, 0x00CED1];
    for (let i = 0; i < 50; i++) {
      const flower = new PIXI.Graphics();
      const color = flowerColors[i % flowerColors.length];
      const x = Math.random() * worldSize.width;
      const y = Math.random() * worldSize.height;
      flower.beginFill(color, 0.9);
      flower.drawCircle(x, y, 3);
      flower.drawCircle(x + 4, y - 2, 3);
      flower.drawCircle(x - 4, y - 2, 3);
      flower.drawCircle(x + 2, y + 3, 3);
      flower.drawCircle(x - 2, y + 3, 3);
      flower.endFill();
      flower.beginFill(0xFFFF00);
      flower.drawCircle(x, y, 1.8);
      flower.endFill();
      this._worldContainer.addChild(flower);
    }

    // Benches along paths
    const benchPositions = [
      { x: 500, y: 1075 }, { x: 1200, y: 1075 }, { x: 2400, y: 1075 },
      { x: 1520, y: 600 }, { x: 1520, y: 1700 },
    ];
    benchPositions.forEach(pos => {
      const bench = this._createBench(pos.x, pos.y);
      bench._sortY = pos.y + 12;
      this._depthSortables.push(bench);
      this._worldContainer.addChild(bench);
    });

    // Lamp posts
    const lampPositions = [
      { x: 400, y: 1065 }, { x: 1000, y: 1065 }, { x: 1800, y: 1065 }, { x: 2600, y: 1065 },
      { x: 1520, y: 500 }, { x: 1520, y: 900 }, { x: 1520, y: 1500 },
    ];
    lampPositions.forEach(pos => {
      const lamp = this._createLamp(pos.x, pos.y);
      lamp._sortY = pos.y;
      this._depthSortables.push(lamp);
      this._worldContainer.addChild(lamp);
    });
  }

  _createBench(x, y) {
    const bench = new PIXI.Container();
    const g = new PIXI.Graphics();
    // Shadow
    g.beginFill(0x000000, SUN.shadowAlpha * 0.7);
    g.drawEllipse(x + SUN.shadowOffsetX * 0.4, y + 14, 28, 6);
    g.endFill();
    // Seat
    g.beginFill(0x8B5E3C);
    g.drawRoundedRect(x - 25, y - 4, 50, 8, 2);
    g.endFill();
    // Back rest
    g.beginFill(0x7A4F33);
    g.drawRoundedRect(x - 25, y - 16, 50, 6, 2);
    g.endFill();
    // Legs
    g.beginFill(0x4A4A4A);
    g.drawRect(x - 22, y + 4, 4, 10);
    g.drawRect(x + 18, y + 4, 4, 10);
    g.endFill();
    bench.addChild(g);
    return bench;
  }

  _createLamp(x, y) {
    const lamp = new PIXI.Container();
    const g = new PIXI.Graphics();
    // Pole shadow
    g.beginFill(0x000000, SUN.shadowAlpha * 0.5);
    g.drawEllipse(x + SUN.shadowOffsetX * 0.3, y + 2, 5, 3);
    g.endFill();
    // Pole
    g.beginFill(0x3A3A3A);
    g.drawRect(x - 2, y - 50, 4, 50);
    g.endFill();
    // Top curve
    g.beginFill(0x3A3A3A);
    g.drawRoundedRect(x - 6, y - 54, 12, 6, 3);
    g.endFill();
    // Light
    g.beginFill(0xFFF3CD, 0.9);
    g.drawCircle(x, y - 58, 7);
    g.endFill();
    // Light glow
    g.beginFill(0xFFE88D, 0.2);
    g.drawCircle(x, y - 58, 14);
    g.endFill();
    lamp.addChild(g);
    return lamp;
  }

  _createTree(x, y) {
    const tree = new PIXI.Container();
    const g = new PIXI.Graphics();

    // Tree shadow on ground
    g.beginFill(0x000000, SUN.shadowAlpha);
    g.drawEllipse(
      x + SUN.shadowOffsetX * 1.5,
      y + SUN.shadowOffsetY * 0.8,
      22, 10
    );
    g.endFill();

    // Trunk - multiple sections for realism
    g.beginFill(0x6B4226);
    g.drawRoundedRect(x - 5, y - 12, 10, 28, 3);
    g.endFill();
    g.beginFill(0x7A5033);
    g.drawRoundedRect(x - 4, y - 8, 8, 20, 2);
    g.endFill();
    // Trunk texture lines
    g.lineStyle(0.5, 0x4A2F18, 0.4);
    g.moveTo(x - 2, y - 10);
    g.lineTo(x - 1, y + 12);
    g.moveTo(x + 2, y - 8);
    g.lineTo(x + 3, y + 10);

    // Visible branches
    g.lineStyle(3, 0x6B4226);
    g.moveTo(x, y - 12);
    g.lineTo(x - 14, y - 25);
    g.moveTo(x, y - 10);
    g.lineTo(x + 12, y - 22);
    g.moveTo(x - 2, y - 14);
    g.lineTo(x - 6, y - 30);
    g.lineStyle(0);

    // Canopy layers (4 sizes for depth)
    g.beginFill(0x1E6B2E, 0.9);
    g.drawEllipse(x, y - 30, 26, 20);
    g.endFill();
    g.beginFill(0x2D8B3E, 0.9);
    g.drawEllipse(x - 6, y - 35, 18, 15);
    g.endFill();
    g.beginFill(0x3CA651);
    g.drawEllipse(x + 7, y - 28, 16, 13);
    g.endFill();
    g.beginFill(0x4BBF62, 0.8);
    g.drawEllipse(x + 2, y - 40, 12, 10);
    g.endFill();

    // Canopy highlight (sun-lit side)
    g.beginFill(0x6EDB7E, 0.3);
    g.drawEllipse(x + 8, y - 34, 10, 8);
    g.endFill();

    tree.addChild(g);
    return tree;
  }

  // ─── ZONES & BUILDINGS ──────────────────────────────────────────────────────

  _loadZones() {
    for (const zone of this._config.zones) {
      const container = new PIXI.Container();
      container.position.set(zone.bounds.x, zone.bounds.y);

      // Zone ground overlay
      const zoneBg = new PIXI.Graphics();
      const baseColor = hex(zone.palette[0]);
      zoneBg.beginFill(baseColor, 0.06);
      zoneBg.drawRoundedRect(10, 10, zone.bounds.width - 20, zone.bounds.height - 20, 30);
      zoneBg.endFill();
      zoneBg.lineStyle(1.5, baseColor, 0.15);
      zoneBg.drawRoundedRect(10, 10, zone.bounds.width - 20, zone.bounds.height - 20, 30);
      container.addChild(zoneBg);

      // Zone sign/banner
      const signBg = new PIXI.Graphics();
      signBg.beginFill(baseColor, 0.9);
      signBg.drawRoundedRect(20, 15, zone.label.length * 11 + 30, 30, 10);
      signBg.endFill();
      signBg.lineStyle(1, lighten(baseColor, 1.4), 0.5);
      signBg.drawRoundedRect(20, 15, zone.label.length * 11 + 30, 30, 10);
      container.addChild(signBg);

      const label = new PIXI.Text(zone.label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        fill: 0xFFFFFF,
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowDistance: 1,
        dropShadowColor: 0x000000,
        dropShadowAlpha: 0.4,
      });
      label.position.set(35, 21);
      container.addChild(label);

      // Buildings in this zone
      for (const building of zone.buildings) {
        const buildingSprite = this._createIsometricBuilding(building, zone);
        buildingSprite.position.set(
          building.position.x - zone.bounds.x,
          building.position.y - zone.bounds.y
        );
        buildingSprite._sortY = building.position.y;
        container.addChild(buildingSprite);
        this._buildingSprites[building.id] = buildingSprite;
      }

      this._zoneContainers[zone.id] = container;
      container._sortY = zone.bounds.y;
      this._depthSortables.push(container);
      this._worldContainer.addChild(container);
    }

    // Special buildings (larger, isometric)
    for (const building of this._config.specialBuildings) {
      const buildingSprite = this._createSpecialIsometricBuilding(building);
      buildingSprite.position.set(building.position.x, building.position.y);
      buildingSprite._sortY = building.position.y;
      this._depthSortables.push(buildingSprite);
      this._worldContainer.addChild(buildingSprite);
      this._buildingSprites[building.id] = buildingSprite;
    }

    // NPCs
    for (const npc of this._config.npcs) {
      const npcSprite = this._createNPC(npc);
      npcSprite.position.set(npc.position.x, npc.position.y);
      npcSprite._sortY = npc.position.y;
      this._depthSortables.push(npcSprite);
      this._worldContainer.addChild(npcSprite);
    }
  }

  _createIsometricBuilding(building, zone) {
    const container = new PIXI.Container();
    const color1 = hex(zone.palette[1] || '#4A90D9');
    const color2 = hex(zone.palette[2] || '#6BB5E0');
    const roofColor = hex(zone.palette[3] || '#E85D04');
    const accentColor = hex(zone.palette[4] || '#4ECDC4');

    const W = 80;  // building width
    const H = 100; // building height (multi-story)
    const D = 25;  // depth (side face width)
    const floors = 3;
    const floorH = H / floors;

    // Drop shadow (elongated ellipse)
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, SUN.shadowAlpha);
    shadow.drawEllipse(
      SUN.shadowOffsetX + 5,
      H / 2 + SUN.shadowOffsetY,
      W * 0.6,
      14
    );
    shadow.endFill();
    container.addChild(shadow);

    const body = new PIXI.Graphics();

    // ── Front face (main wall) ──
    const frontColor = Math.round(color1 * SUN.topFaceBrightness);
    body.beginFill(color1);
    body.drawRect(-W / 2, -H / 2, W, H);
    body.endFill();

    // ── Right side face (isometric depth, lit by sun) ──
    const sideColor = darken(color1, SUN.litFaceBrightness > 1 ? 0.85 : 0.6);
    body.beginFill(sideColor);
    body.moveTo(W / 2, -H / 2);
    body.lineTo(W / 2 + D, -H / 2 - D * ISO_DEPTH);
    body.lineTo(W / 2 + D, H / 2 - D * ISO_DEPTH);
    body.lineTo(W / 2, H / 2);
    body.closePath();
    body.endFill();

    // ── Top face (roof area) ──
    const topColor = lighten(roofColor, 1.1);
    body.beginFill(topColor);
    body.moveTo(-W / 2, -H / 2);
    body.lineTo(-W / 2 + D, -H / 2 - D * ISO_DEPTH);
    body.lineTo(W / 2 + D, -H / 2 - D * ISO_DEPTH);
    body.lineTo(W / 2, -H / 2);
    body.closePath();
    body.endFill();

    // ── Floor lines (visible stories) ──
    body.lineStyle(1, darken(color1, 0.6), 0.4);
    for (let f = 1; f < floors; f++) {
      const fy = -H / 2 + f * floorH;
      body.moveTo(-W / 2 + 2, fy);
      body.lineTo(W / 2 - 2, fy);
      // Side face floor line
      body.moveTo(W / 2, fy);
      body.lineTo(W / 2 + D, fy - D * ISO_DEPTH);
    }
    body.lineStyle(0);

    // ── Windows with glass reflections ──
    for (let f = 0; f < floors; f++) {
      const fy = -H / 2 + f * floorH + floorH * 0.25;
      const winH = floorH * 0.45;
      const winW = 14;
      const winGap = 20;
      const startX = -W / 2 + 12;

      for (let w = 0; w < 3; w++) {
        const wx = startX + w * winGap;
        // Window frame
        body.beginFill(0x1A3A5C, 0.9);
        body.drawRoundedRect(wx, fy, winW, winH, 2);
        body.endFill();
        // Glass
        body.beginFill(0x87CEEB, 0.7);
        body.drawRoundedRect(wx + 1, fy + 1, winW - 2, winH - 2, 1);
        body.endFill();
        // Reflection highlight (small white rect in top-left)
        body.beginFill(0xFFFFFF, 0.4);
        body.drawRect(wx + 2, fy + 2, 4, 6);
        body.endFill();
      }

      // Side face windows (smaller, perspective)
      if (f < floors) {
        const sfy = fy - 2;
        body.beginFill(0x1A3A5C, 0.7);
        body.drawRect(W / 2 + 5, sfy, 10, winH * 0.8);
        body.endFill();
        body.beginFill(0x87CEEB, 0.5);
        body.drawRect(W / 2 + 6, sfy + 1, 8, winH * 0.8 - 2);
        body.endFill();
        body.beginFill(0xFFFFFF, 0.3);
        body.drawRect(W / 2 + 7, sfy + 2, 3, 4);
        body.endFill();
      }
    }

    // ── Door with awning ──
    const doorY = H / 2 - 28;
    body.beginFill(0x4A3020);
    body.drawRoundedRect(-9, doorY, 18, 28, 3);
    body.endFill();
    // Door handle
    body.beginFill(0xFFD700);
    body.drawCircle(6, doorY + 16, 2);
    body.endFill();
    // Awning/overhang
    body.beginFill(accentColor, 0.9);
    body.moveTo(-16, doorY - 2);
    body.lineTo(16, doorY - 2);
    body.lineTo(14, doorY - 8);
    body.lineTo(-14, doorY - 8);
    body.closePath();
    body.endFill();
    // Awning shadow on wall
    body.beginFill(0x000000, 0.08);
    body.drawRect(-14, doorY - 2, 28, 4);
    body.endFill();

    // ── Roof details ──
    // AC unit
    body.beginFill(0x888888);
    body.drawRect(-W / 2 + 8, -H / 2 - D * ISO_DEPTH - 6, 14, 6);
    body.endFill();
    body.beginFill(0x666666);
    body.drawRect(-W / 2 + 9, -H / 2 - D * ISO_DEPTH - 5, 12, 4);
    body.endFill();
    // Antenna
    body.beginFill(0x444444);
    body.drawRect(W / 2 - 5, -H / 2 - D * ISO_DEPTH - 18, 2, 18);
    body.endFill();
    body.beginFill(0xFF3333, 0.8);
    body.drawCircle(W / 2 - 4, -H / 2 - D * ISO_DEPTH - 18, 2);
    body.endFill();

    container.addChild(body);

    // ── Icon badge ──
    const iconBg = new PIXI.Graphics();
    iconBg.beginFill(0xFFFFFF, 0.95);
    iconBg.drawCircle(W / 2 + D - 5, -H / 2 - D * ISO_DEPTH - 8, 13);
    iconBg.endFill();
    iconBg.lineStyle(2, roofColor);
    iconBg.drawCircle(W / 2 + D - 5, -H / 2 - D * ISO_DEPTH - 8, 13);
    container.addChild(iconBg);

    const iconText = new PIXI.Text(building.icon || '🏢', { fontSize: 13 });
    iconText.anchor.set(0.5);
    iconText.position.set(W / 2 + D - 5, -H / 2 - D * ISO_DEPTH - 8);
    container.addChild(iconText);

    // ── Label below building ──
    const labelBg = new PIXI.Graphics();
    labelBg.beginFill(0x000000, 0.65);
    labelBg.drawRoundedRect(-50, H / 2 + 6, 100, 20, 8);
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
    nameLabel.position.set(0, H / 2 + 16);
    container.addChild(nameLabel);

    container.interactive = true;
    container.buttonMode = true;
    container._buildingData = building;
    container._baseScale = 1;

    return container;
  }

  _createSpecialIsometricBuilding(building) {
    const container = new PIXI.Container();

    const W = 120;
    const H = 130;
    const D = 35;
    const floors = 4;
    const floorH = H / floors;

    const mainColor = 0x3D5A80;
    const sideColor = darken(mainColor, 0.75);
    const roofColor = 0x2C4A6E;

    // Drop shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, SUN.shadowAlpha);
    shadow.drawEllipse(
      SUN.shadowOffsetX * 1.5,
      H / 2 + SUN.shadowOffsetY * 1.2,
      W * 0.65,
      18
    );
    shadow.endFill();
    container.addChild(shadow);

    const body = new PIXI.Graphics();

    // Front face
    body.beginFill(mainColor);
    body.drawRect(-W / 2, -H / 2, W, H);
    body.endFill();

    // Right side face (lit)
    body.beginFill(sideColor);
    body.moveTo(W / 2, -H / 2);
    body.lineTo(W / 2 + D, -H / 2 - D * ISO_DEPTH);
    body.lineTo(W / 2 + D, H / 2 - D * ISO_DEPTH);
    body.lineTo(W / 2, H / 2);
    body.closePath();
    body.endFill();

    // Top face
    body.beginFill(roofColor);
    body.moveTo(-W / 2, -H / 2);
    body.lineTo(-W / 2 + D, -H / 2 - D * ISO_DEPTH);
    body.lineTo(W / 2 + D, -H / 2 - D * ISO_DEPTH);
    body.lineTo(W / 2, -H / 2);
    body.closePath();
    body.endFill();

    // Floor lines
    body.lineStyle(1, 0x2A4060, 0.5);
    for (let f = 1; f < floors; f++) {
      const fy = -H / 2 + f * floorH;
      body.moveTo(-W / 2 + 2, fy);
      body.lineTo(W / 2 - 2, fy);
      body.moveTo(W / 2, fy);
      body.lineTo(W / 2 + D, fy - D * ISO_DEPTH);
    }
    body.lineStyle(0);

    // Columns on front face
    body.beginFill(0xD4C5A9);
    body.drawRoundedRect(-W / 2 + 8, -H / 4, 7, H * 0.6, 2);
    body.drawRoundedRect(-W / 2 + 28, -H / 4, 7, H * 0.6, 2);
    body.drawRoundedRect(W / 2 - 35, -H / 4, 7, H * 0.6, 2);
    body.drawRoundedRect(W / 2 - 15, -H / 4, 7, H * 0.6, 2);
    body.endFill();

    // Windows (arched style for special buildings)
    for (let f = 0; f < floors; f++) {
      const fy = -H / 2 + f * floorH + floorH * 0.2;
      const winH = floorH * 0.55;
      const positions = [-W / 2 + 18, -W / 2 + 42, W / 2 - 54, W / 2 - 30];
      positions.forEach(wx => {
        body.beginFill(0x1A2A40, 0.85);
        body.drawRoundedRect(wx, fy, 16, winH, 3);
        body.endFill();
        body.beginFill(0xB8D4E8, 0.6);
        body.drawRoundedRect(wx + 1.5, fy + 1.5, 13, winH - 3, 2);
        body.endFill();
        // Glass reflection
        body.beginFill(0xFFFFFF, 0.35);
        body.drawRect(wx + 2.5, fy + 3, 4, 7);
        body.endFill();
      });

      // Side windows
      body.beginFill(0x1A2A40, 0.7);
      body.drawRect(W / 2 + 6, fy, 12, winH * 0.8);
      body.endFill();
      body.beginFill(0xB8D4E8, 0.5);
      body.drawRect(W / 2 + 7.5, fy + 1.5, 9, winH * 0.8 - 3);
      body.endFill();
      body.beginFill(0xFFFFFF, 0.25);
      body.drawRect(W / 2 + 8, fy + 3, 3, 5);
      body.endFill();
    }

    // Grand door with awning
    const doorY = H / 2 - 38;
    body.beginFill(0x6B3A1F);
    body.drawRoundedRect(-14, doorY, 28, 38, 4);
    body.endFill();
    // Double door detail
    body.lineStyle(1, 0x4A2A12, 0.6);
    body.moveTo(0, doorY + 2);
    body.lineTo(0, doorY + 36);
    body.lineStyle(0);
    // Door handles
    body.beginFill(0xFFD700);
    body.drawCircle(-5, doorY + 20, 2.5);
    body.drawCircle(5, doorY + 20, 2.5);
    body.endFill();
    // Grand awning
    body.beginFill(0x2C4A6E, 0.9);
    body.moveTo(-24, doorY - 2);
    body.lineTo(24, doorY - 2);
    body.lineTo(20, doorY - 12);
    body.lineTo(-20, doorY - 12);
    body.closePath();
    body.endFill();

    // Roof details - AC units, antenna
    body.beginFill(0x777777);
    body.drawRect(-W / 2 + 12, -H / 2 - D * ISO_DEPTH - 8, 18, 8);
    body.drawRect(W / 2 - 20, -H / 2 - D * ISO_DEPTH - 6, 12, 6);
    body.endFill();
    // Antenna
    body.beginFill(0x444444);
    body.drawRect(0, -H / 2 - D * ISO_DEPTH - 24, 2, 24);
    body.endFill();
    body.beginFill(0xFF2222, 0.9);
    body.drawCircle(1, -H / 2 - D * ISO_DEPTH - 24, 3);
    body.endFill();

    // Gold trim around building top
    body.lineStyle(2, 0xFFD700, 0.7);
    body.moveTo(-W / 2, -H / 2);
    body.lineTo(W / 2, -H / 2);
    body.lineTo(W / 2 + D, -H / 2 - D * ISO_DEPTH);
    body.lineStyle(0);

    container.addChild(body);

    // Icon badge (larger, gold)
    const iconBg = new PIXI.Graphics();
    iconBg.beginFill(0xFFD700);
    iconBg.drawCircle(0, -H / 2 - D * ISO_DEPTH - 14, 16);
    iconBg.endFill();
    iconBg.lineStyle(2, 0xFFFFFF);
    iconBg.drawCircle(0, -H / 2 - D * ISO_DEPTH - 14, 16);
    container.addChild(iconBg);

    const iconText = new PIXI.Text(building.icon || '🏛️', { fontSize: 16 });
    iconText.anchor.set(0.5);
    iconText.position.set(0, -H / 2 - D * ISO_DEPTH - 14);
    container.addChild(iconText);

    // Name plate
    const plateBg = new PIXI.Graphics();
    plateBg.beginFill(0x1a1a2e, 0.88);
    plateBg.drawRoundedRect(-65, H / 2 + 8, 130, 24, 10);
    plateBg.endFill();
    plateBg.lineStyle(1, 0xFFD700, 0.5);
    plateBg.drawRoundedRect(-65, H / 2 + 8, 130, 24, 10);
    container.addChild(plateBg);

    const nameLabel = new PIXI.Text(building.label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: 11,
      fill: 0xFFFFFF,
      fontWeight: 'bold',
      align: 'center',
    });
    nameLabel.anchor.set(0.5);
    nameLabel.position.set(0, H / 2 + 20);
    container.addChild(nameLabel);

    container.interactive = true;
    container.buttonMode = true;
    container._buildingData = building;
    container._baseScale = 1;

    return container;
  }

  _createNPC(npc) {
    const container = new PIXI.Container();

    // Shadow
    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, SUN.shadowAlpha);
    shadow.drawEllipse(SUN.shadowOffsetX * 0.3, 18, 12, 5);
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

    // Speech indicator
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
    nameBg.beginFill(0x000000, 0.55);
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

  // ─── DEPTH SORTING ──────────────────────────────────────────────────────────

  sortByDepth() {
    // Use zIndex-based sorting instead of manual child reordering
    // This preserves the avatar's zIndex (9999) set in Campus.js
    for (const child of this._worldContainer.children) {
      if (child._sortY !== undefined) {
        child.zIndex = Math.floor(child._sortY);
      }
    }
  }

  // ─── ZOOM ON APPROACH ───────────────────────────────────────────────────────

  _updateZoomOnApproach(playerPos) {
    const ZOOM_RADIUS = 150;
    const ZOOM_SCALE = 1.05;
    const TWEEN_SPEED = 0.05;

    for (const [id, sprite] of Object.entries(this._buildingSprites)) {
      const building = this._allBuildings.find(b => b.id === id);
      if (!building) continue;

      const bx = building.position.x;
      const by = building.position.y;
      const dist = Math.sqrt((playerPos.x - bx) ** 2 + (playerPos.y - by) ** 2);

      const targetScale = dist < ZOOM_RADIUS ? ZOOM_SCALE : 1.0;
      const currentScale = sprite.scale.x;
      const newScale = currentScale + (targetScale - currentScale) * TWEEN_SPEED;

      sprite.scale.set(newScale);
    }
  }

  // ─── ANIMATION UPDATE ───────────────────────────────────────────────────────

  _updateAnimations() {
    this._time += 0.016; // ~60fps delta

    for (const obj of this._animatedObjects) {
      if (obj.type === 'ripples') {
        const g = obj.graphics;
        g.clear();

        // Draw 3 concentric ripple rings using sine wave
        for (let ring = 0; ring < 3; ring++) {
          const phase = this._time * 2 + ring * 2.1;
          const radius = 15 + (phase % 4) * 15;
          const alpha = Math.max(0, 0.4 - (radius / obj.maxRadius) * 0.4);

          if (radius < obj.maxRadius) {
            g.lineStyle(1.5, 0xFFFFFF, alpha);
            g.drawEllipse(obj.cx, obj.cy, radius, radius * 0.6);
          }
        }

        // Sine-wave ripple line across pond
        g.lineStyle(1, 0xFFFFFF, 0.2);
        g.moveTo(obj.cx - 60, obj.cy);
        for (let x = -60; x <= 60; x += 4) {
          const waveY = Math.sin((x + this._time * 80) * 0.08) * 3;
          g.lineTo(obj.cx + x, obj.cy + waveY);
        }
      }
    }
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────────────

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

    // Update zoom-on-approach for buildings
    this._updateZoomOnApproach(pos);

    // Update animated objects (water ripples)
    this._updateAnimations();

    // Re-sort by depth periodically (every frame is fine for this scale)
    this.sortByDepth();
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
