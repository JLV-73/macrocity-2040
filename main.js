/**
 * MacroCity 2040 — main.js
 * Full Three.js browser city-builder prototype
 * Author: AI Senior Game Dev (prototype)
 *
 * Architecture:
 *   Config          — tuneable constants
 *   State           — all mutable game state
 *   SceneManager    — Three.js scene / camera / lights
 *   GridManager     — city grid data + 3D tile meshes
 *   BuildingDefs    — building type definitions
 *   ResourceManager — resource tracking + tick logic
 *   InputManager    — raycasting, mouse, button events
 *   UIManager       — DOM updates, toasts, overlays
 *   GameLoop        — requestAnimationFrame + tick timer
 */

'use strict';

/* ════════════════════════════════════════════════
   CONFIG
   ════════════════════════════════════════════════ */
const Config = {
  GRID_W:       20,        // columns
  GRID_H:       20,        // rows
  CELL_SIZE:    2.4,       // world units per cell
  TICK_MS:      4000,      // ms between resource ticks
  WIN_POP:      600,       // population needed to win
  WIN_SAT:      75,        // min satisfaction % to win
  BANKRUPT_THRESHOLD: -200,// money below this = game over
  ENERGY_CRISIS_TICKS: 3,  // consecutive negative-energy ticks before crisis
};

/* ════════════════════════════════════════════════
   BUILDING DEFINITIONS
   Each type: cost, one-time effects, per-tick effects
   ════════════════════════════════════════════════ */
const BuildingDefs = {
  housing: {
    label:        'HOUSING BLOCK',
    icon:         '🏠',
    color:        0x2a7fff,
    emissive:     0x00396e,
    heightMin:    0.6, heightMax: 1.8,
    cost:         500,
    pop:          80,
    satisf:       8,
    tickEnergy:  -15,
    tickMoney:   -5,
    tickPop:      0,
    tickSatisf:   0.5,
  },
  energy: {
    label:        'POWER PLANT',
    icon:         '⚡',
    color:        0xffb700,
    emissive:     0x442800,
    heightMin:    1.0, heightMax: 1.4,
    cost:         1200,
    pop:          0,
    satisf:      -5,
    tickEnergy:   120,
    tickMoney:   -20,
    tickPop:      0,
    tickSatisf:  -0.3,
  },
  commercial: {
    label:        'COMMERCIAL HUB',
    icon:         '🏢',
    color:        0x8855ff,
    emissive:     0x220040,
    heightMin:    1.2, heightMax: 2.8,
    cost:         900,
    pop:          12,
    satisf:       12,
    tickEnergy:  -25,
    tickMoney:    60,
    tickPop:      0.5,
    tickSatisf:   0.8,
  },
  park: {
    label:        'GREEN PARK',
    icon:         '🌿',
    color:        0x22cc66,
    emissive:     0x003a1a,
    heightMin:    0.05, heightMax: 0.08,
    cost:         300,
    pop:          0,
    satisf:       20,
    tickEnergy:  -3,
    tickMoney:   -2,
    tickPop:      0,
    tickSatisf:   1.0,
  },
};

/* ════════════════════════════════════════════════
   STATE
   ════════════════════════════════════════════════ */
const State = {
  money:       5000,
  energy:      200,
  population:  0,
  satisfaction:50,
  year:        2040,
  tick:        0,
  energyCrisisTicks: 0,
  paused:      false,
  gameOver:    false,

  // Input
  selectedCell:  null,   // { gx, gz } grid coords
  buildMode:     'build', // 'build' | 'demolish'
  selectedType:  null,   // 'housing' | 'energy' | 'commercial' | 'park'

  // Grid: 2D array [gx][gz] = { type, mesh } | null
  grid: [],
};

/* ════════════════════════════════════════════════
   SCENE MANAGER
   ════════════════════════════════════════════════ */
const SceneManager = (() => {
  let scene, camera, renderer, controls, clock;
  let selectionMesh;     // hover/selection highlight
  let energyCrisisColor = new THREE.Color(0xff2244);
  let normalFogColor    = new THREE.Color(0x080c10);

  function init() {
    // ── Renderer ──
    const canvas = document.getElementById('city-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // ── Scene ──
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080c10);
    scene.fog = new THREE.FogExp2(0x080c10, 0.022);

    // ── Camera ──
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 300);
    camera.position.set(20, 22, 26);
    camera.lookAt(0, 0, 0);

    // ── Orbit Controls ──
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.target.set(0, 0, 0);

    clock = new THREE.Clock();

    // ── Lighting ──
    // Ambient
    const ambient = new THREE.AmbientLight(0x101828, 2.0);
    scene.add(ambient);

    // Directional (sun-like)
    const sun = new THREE.DirectionalLight(0x8ab4d0, 2.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 150;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -35;
    sun.shadow.camera.right = sun.shadow.camera.top   =  35;
    scene.add(sun);

    // Rim / fill
    const rimLight = new THREE.DirectionalLight(0x002244, 1.0);
    rimLight.position.set(-20, 10, -20);
    scene.add(rimLight);

    // Cyan point light near center (atmosphere)
    const cityGlow = new THREE.PointLight(0x00aaff, 1.5, 60, 2);
    cityGlow.position.set(0, 6, 0);
    scene.add(cityGlow);

    // ── Ground plane (terrain) ──
    const groundGeo  = new THREE.PlaneGeometry(200, 200);
    const groundMat  = new THREE.MeshStandardMaterial({
      color: 0x040810,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Grid lines (roads) ──
    buildRoadGrid();

    // ── Selection highlight ──
    const selGeo = new THREE.BoxGeometry(Config.CELL_SIZE * .96, 0.05, Config.CELL_SIZE * .96);
    const selMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.35 });
    selectionMesh = new THREE.Mesh(selGeo, selMat);
    selectionMesh.visible = false;
    scene.add(selectionMesh);

    // Resize handler
    window.addEventListener('resize', onResize);
  }

  function buildRoadGrid() {
    const W = Config.GRID_W, H = Config.GRID_H, CS = Config.CELL_SIZE;
    const total_w = W * CS, total_h = H * CS;
    const originX = -total_w / 2, originZ = -total_h / 2;

    const mat = new THREE.LineBasicMaterial({ color: 0x1a2e42, transparent: true, opacity: 0.7 });
    const pts = [];

    // Vertical lines
    for (let i = 0; i <= W; i++) {
      const x = originX + i * CS;
      pts.push(new THREE.Vector3(x, 0.02, originZ), new THREE.Vector3(x, 0.02, originZ + total_h));
    }
    // Horizontal lines
    for (let j = 0; j <= H; j++) {
      const z = originZ + j * CS;
      pts.push(new THREE.Vector3(originX, 0.02, z), new THREE.Vector3(originX + total_w, 0.02, z));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    // Use LineSegments so each pair of pts is a segment
    const lines = new THREE.LineSegments(geo, mat);
    scene.add(lines);

    // Thin road surface
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x0a1520, roughness: 0.95 });
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        const geo2 = new THREE.BoxGeometry(CS * .985, 0.01, CS * .985);
        const tile = new THREE.Mesh(geo2, roadMat);
        tile.position.set(originX + (i + 0.5) * CS, 0, originZ + (j + 0.5) * CS);
        tile.receiveShadow = true;
        scene.add(tile);
      }
    }
  }

  function highlightCell(gx, gz, show) {
    if (!show) { selectionMesh.visible = false; return; }
    const pos = gridToWorld(gx, gz);
    selectionMesh.position.set(pos.x, 0.03, pos.z);
    selectionMesh.visible = true;
  }

  // Pulse selection mesh opacity
  function animateSelection(t) {
    if (selectionMesh.visible) {
      selectionMesh.material.opacity = 0.2 + 0.25 * Math.abs(Math.sin(t * 3));
    }
  }

  function setCrisisMode(active) {
    scene.fog.color.copy(active ? energyCrisisColor : normalFogColor);
    scene.background.copy(active ? new THREE.Color(0x180008) : new THREE.Color(0x080c10));
  }

  function getScene()    { return scene; }
  function getCamera()   { return camera; }
  function getRenderer() { return renderer; }
  function getControls() { return controls; }
  function getClock()    { return clock; }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  return { init, highlightCell, animateSelection, setCrisisMode,
           getScene, getCamera, getRenderer, getControls, getClock };
})();

/* ════════════════════════════════════════════════
   GRID MANAGER
   ════════════════════════════════════════════════ */
const GridManager = (() => {

  // Initialize 2D grid
  function init() {
    for (let x = 0; x < Config.GRID_W; x++) {
      State.grid[x] = [];
      for (let z = 0; z < Config.GRID_H; z++) {
        State.grid[x][z] = null;
      }
    }
  }

  function isValid(gx, gz) {
    return gx >= 0 && gx < Config.GRID_W && gz >= 0 && gz < Config.GRID_H;
  }

  function isEmpty(gx, gz) {
    return isValid(gx, gz) && State.grid[gx][gz] === null;
  }

  /**
   * Place a building of `type` at grid position (gx, gz).
   * Returns true on success.
   */
  function placeBuilding(gx, gz, type) {
    if (!isEmpty(gx, gz)) { UIManager.toast('Cell already occupied!', 'warn'); return false; }
    const def = BuildingDefs[type];
    if (!def) return false;

    if (State.money < def.cost) {
      UIManager.toast('Not enough credits!', 'error');
      return false;
    }

    // Deduct cost
    State.money -= def.cost;

    // Immediate population / satisfaction bonus
    State.population  += def.pop;
    State.satisfaction = Math.min(100, State.satisfaction + def.satisf);

    // Build 3D mesh with animation
    const mesh = createBuildingMesh(gx, gz, def);
    State.grid[gx][gz] = { type, mesh };

    UIManager.toast(`${def.label} placed!`, 'ok');
    return true;
  }

  /**
   * Demolish building at (gx, gz).
   * Returns true on success.
   */
  function demolishBuilding(gx, gz) {
    if (!isValid(gx, gz) || !State.grid[gx][gz]) {
      UIManager.toast('Nothing to demolish here.', 'warn'); return false;
    }
    const cell = State.grid[gx][gz];
    const def  = BuildingDefs[cell.type];

    // Remove mesh
    SceneManager.getScene().remove(cell.mesh);

    // Partial refund (40%)
    const refund = Math.floor(def.cost * 0.4);
    State.money += refund;

    // Reverse permanent pop/sat bonus (partial)
    State.population  = Math.max(0, State.population - def.pop);
    State.satisfaction = Math.max(0, State.satisfaction - Math.abs(def.satisf) * 0.5);

    State.grid[gx][gz] = null;
    UIManager.toast(`Demolished. Refund: ${refund} cr`, 'ok');
    return true;
  }

  function createBuildingMesh(gx, gz, def) {
    const pos = gridToWorld(gx, gz);
    const h   = def.heightMin + Math.random() * (def.heightMax - def.heightMin);

    // Main building body
    const geo = new THREE.BoxGeometry(
      Config.CELL_SIZE * 0.72,
      h,
      Config.CELL_SIZE * 0.72
    );
    const mat = new THREE.MeshStandardMaterial({
      color:    def.color,
      emissive: def.emissive,
      emissiveIntensity: 0.6,
      roughness: 0.55,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;

    // Start below ground for spawn animation
    mesh.position.set(pos.x, -h, pos.z);

    // Windows / detail layer for taller buildings
    if (h > 1.0 && def.heightMax > 1.0) {
      const wGeo = new THREE.BoxGeometry(
        Config.CELL_SIZE * 0.75, h * 0.98, Config.CELL_SIZE * 0.75
      );
      const wMat = new THREE.MeshStandardMaterial({
        color: 0x002040,
        emissive: def.color,
        emissiveIntensity: 0.08,
        wireframe: false,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0.5,
      });
      const wMesh = new THREE.Mesh(wGeo, wMat);
      mesh.add(wMesh);
    }

    // Glow point light on some buildings
    if (['energy', 'commercial'].includes(def.label ? null : '')) {
      // skip — controlled below
    }
    if (def === BuildingDefs.energy) {
      const glow = new THREE.PointLight(0xffaa00, 2.0, 8, 2);
      glow.position.set(0, h / 2 + 0.3, 0);
      mesh.add(glow);
    }

    SceneManager.getScene().add(mesh);

    // Animate rise
    const targetY = h / 2;
    animateRise(mesh, targetY, 600);

    return mesh;
  }

  /**
   * Simple rise animation (no dep on tweens)
   */
  function animateRise(mesh, targetY, durationMs) {
    const startY  = mesh.position.y;
    const startMs = performance.now();
    function step(now) {
      const t = Math.min((now - startMs) / durationMs, 1);
      // Ease out back
      const eased = 1 - Math.pow(1 - t, 3);
      mesh.position.y = startY + (targetY - startY) * eased;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /** Compute per-tick resource deltas from all placed buildings */
  function computeTickDeltas() {
    let dMoney = 0, dEnergy = 0, dPop = 0, dSat = 0;
    for (let x = 0; x < Config.GRID_W; x++) {
      for (let z = 0; z < Config.GRID_H; z++) {
        const cell = State.grid[x][z];
        if (!cell) continue;
        const def = BuildingDefs[cell.type];
        dMoney  += def.tickMoney;
        dEnergy += def.tickEnergy;
        dPop    += def.tickPop;
        dSat    += def.tickSatisf;
      }
    }
    return { dMoney, dEnergy, dPop, dSat };
  }

  function getCellInfo(gx, gz) {
    if (!isValid(gx, gz)) return null;
    const cell = State.grid[gx][gz];
    if (!cell) return { type: null };
    return { type: cell.type, label: BuildingDefs[cell.type].label };
  }

  return { init, placeBuilding, demolishBuilding, computeTickDeltas, getCellInfo, isEmpty, isValid };
})();

/* ════════════════════════════════════════════════
   RESOURCE MANAGER
   ════════════════════════════════════════════════ */
const ResourceManager = (() => {

  function applyTick() {
    if (State.gameOver) return;

    const { dMoney, dEnergy, dPop, dSat } = GridManager.computeTickDeltas();

    State.money  += dMoney;
    State.energy  = Math.max(0, State.energy + dEnergy);
    State.population = Math.max(0, State.population + dPop);
    State.satisfaction = Math.min(100, Math.max(0, State.satisfaction + dSat));

    // Base city income (small)
    State.money += 10 + Math.floor(State.population * 0.04);

    // Energy crisis tracking
    if (State.energy <= 0 && dEnergy < 0) {
      State.energyCrisisTicks++;
      State.satisfaction = Math.max(0, State.satisfaction - 3);
    } else {
      State.energyCrisisTicks = Math.max(0, State.energyCrisisTicks - 1);
    }
    SceneManager.setCrisisMode(State.energyCrisisTicks >= Config.ENERGY_CRISIS_TICKS);

    // Satisfaction drift toward 50 if no buildings
    const anyBuildings = State.grid.some(col => col.some(c => c !== null));
    if (!anyBuildings) State.satisfaction += (50 - State.satisfaction) * 0.05;

    State.tick++;
    // One new year every 5 ticks
    if (State.tick % 5 === 0) State.year++;

    checkWinLose();
  }

  function checkWinLose() {
    // Lose: bankrupt
    if (State.money < Config.BANKRUPT_THRESHOLD) {
      State.gameOver = true;
      UIManager.showOverlay(false,
        'CITY BANKRUPT',
        'Your credits ran dry. The megacity went dark.');
      return;
    }
    // Lose: satisfaction too low for too long (simple: sat < 10 + money negative)
    if (State.satisfaction < 5 && State.money < 0) {
      State.gameOver = true;
      UIManager.showOverlay(false,
        'CITY COLLAPSED',
        'Satisfaction hit zero. Citizens revolted and left.');
      return;
    }
    // Win condition
    if (State.population >= Config.WIN_POP && State.satisfaction >= Config.WIN_SAT) {
      State.gameOver = true;
      UIManager.showOverlay(true,
        'METROPOLIS ACHIEVED',
        `Year ${State.year}: MacroCity is a thriving megacity!\nPop: ${State.population} | Sat: ${Math.round(State.satisfaction)}%`);
    }
  }

  return { applyTick };
})();

/* ════════════════════════════════════════════════
   INPUT MANAGER  (raycasting + buttons)
   ════════════════════════════════════════════════ */
const InputManager = (() => {
  const raycaster = new THREE.Raycaster();
  const mouse     = new THREE.Vector2();

  // Invisible ground plane for raycasting
  let groundPlane;

  function init() {
    // Ground plane for picking (matches visual ground)
    const geo = new THREE.PlaneGeometry(1000, 1000);
    const mat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    groundPlane = new THREE.Mesh(geo, mat);
    groundPlane.rotation.x = -Math.PI / 2;
    SceneManager.getScene().add(groundPlane);

    // Canvas click
    const canvas = document.getElementById('city-canvas');
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', onMouseMove);

    // Build buttons
    document.querySelectorAll('.build-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('selected'));
        if (State.selectedType === type) {
          State.selectedType = null; // deselect
        } else {
          State.selectedType = type;
          btn.classList.add('selected');
          State.buildMode = 'build';
          setToolActive('btn-build-mode');
        }
      });
    });

    // Tool buttons
    document.getElementById('btn-build-mode').addEventListener('click', () => {
      State.buildMode = 'build';
      setToolActive('btn-build-mode');
    });
    document.getElementById('btn-demolish').addEventListener('click', () => {
      State.buildMode = 'demolish';
      State.selectedType = null;
      document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('selected'));
      setToolActive('btn-demolish');
    });

    // Overlay restart
    document.getElementById('overlay-restart').addEventListener('click', restartGame);
  }

  function setToolActive(id) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  function pickCell(event) {
    const canvas = SceneManager.getRenderer().domElement;
    const rect   = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, SceneManager.getCamera());
    const hits = raycaster.intersectObject(groundPlane);
    if (!hits.length) return null;

    const p  = hits[0].point;
    const W  = Config.GRID_W, H = Config.GRID_H, CS = Config.CELL_SIZE;
    const ox = -W * CS / 2, oz = -H * CS / 2;

    const gx = Math.floor((p.x - ox) / CS);
    const gz = Math.floor((p.z - oz) / CS);

    if (!GridManager.isValid(gx, gz)) return null;
    return { gx, gz };
  }

  function onMouseMove(event) {
    const cell = pickCell(event);
    if (cell) {
      State.selectedCell = cell;
      SceneManager.highlightCell(cell.gx, cell.gz, true);
      updateCellInfo(cell.gx, cell.gz);
    } else {
      SceneManager.highlightCell(0, 0, false);
    }
  }

  function onCanvasClick(event) {
    if (State.gameOver || State.paused) return;
    const cell = pickCell(event);
    if (!cell) return;

    if (State.buildMode === 'demolish') {
      GridManager.demolishBuilding(cell.gx, cell.gz);
    } else if (State.buildMode === 'build' && State.selectedType) {
      GridManager.placeBuilding(cell.gx, cell.gz, State.selectedType);
    }
  }

  function updateCellInfo(gx, gz) {
    const info = GridManager.getCellInfo(gx, gz);
    const el   = document.getElementById('cell-detail');
    if (!info) { el.textContent = '— none —'; return; }
    if (!info.type) {
      el.textContent = `[${gx}, ${gz}]\nEMPTY CELL`;
    } else {
      const def = BuildingDefs[info.type];
      el.innerHTML =
        `[${gx}, ${gz}]<br>${info.label}<br>` +
        `<span style="color:${def.tickEnergy>0?'#39ff80':'#ff3a5c'}">` +
        `NRG ${def.tickEnergy > 0 ? '+' : ''}${def.tickEnergy}/tick</span><br>` +
        `<span style="color:#ffb700">CR ${def.tickMoney > 0 ? '+' : ''}${def.tickMoney}/tick</span>`;
    }
  }

  return { init };
})();

/* ════════════════════════════════════════════════
   UI MANAGER
   ════════════════════════════════════════════════ */
const UIManager = (() => {

  let toastQueue = [];

  function updateHUD() {
    // Money
    setVal('val-money', Math.round(State.money), 'res-money',
      State.money < 500 ? 'warning' : '', State.money < 0 ? 'critical' : '');

    // Energy
    setVal('val-energy', Math.round(State.energy), 'res-energy',
      State.energy < 50 ? 'warning' : '', State.energy <= 0 ? 'critical' : '');

    // Population
    setVal('val-pop', Math.round(State.population), 'res-pop', '', '');

    // Satisfaction
    setVal('val-sat', Math.round(State.satisfaction), 'res-sat',
      State.satisfaction < 30 ? 'warning' : '', State.satisfaction < 15 ? 'critical' : '');

    // Year
    document.getElementById('game-year').textContent = `YEAR ${State.year}`;
  }

  function setVal(valId, value, blockId, warnClass, critClass) {
    document.getElementById(valId).textContent = value;
    const block = document.getElementById(blockId);
    block.classList.remove('warning', 'critical');
    if (critClass) block.classList.add('critical');
    else if (warnClass) block.classList.add('warning');
  }

  function updateTickBar(progress) {
    document.getElementById('tick-fill').style.width = (progress * 100) + '%';
  }

  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function showOverlay(win, title, msg) {
    const el = document.getElementById('overlay');
    const box = document.getElementById('overlay-box');
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-msg').textContent   = msg;
    box.classList.toggle('win', win);
    el.classList.remove('hidden');
  }

  function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
  }

  return { updateHUD, updateTickBar, toast, showOverlay, hideOverlay };
})();

/* ════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════ */
function gridToWorld(gx, gz) {
  const CS = Config.CELL_SIZE;
  const ox = -Config.GRID_W * CS / 2;
  const oz = -Config.GRID_H * CS / 2;
  return {
    x: ox + (gx + 0.5) * CS,
    z: oz + (gz + 0.5) * CS,
  };
}

/* ════════════════════════════════════════════════
   GAME LOOP
   ════════════════════════════════════════════════ */
const GameLoop = (() => {

  let lastTickTime = 0;
  let rafId;

  function start() {
    lastTickTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);

    const clock    = SceneManager.getClock();
    const delta    = clock.getDelta();
    const elapsed  = clock.getElapsedTime();

    // Controls
    SceneManager.getControls().update();

    // Selection pulse
    SceneManager.animateSelection(elapsed);

    // Tick
    const tickProgress = Math.min((now - lastTickTime) / Config.TICK_MS, 1);
    UIManager.updateTickBar(tickProgress);

    if (!State.gameOver && !State.paused && now - lastTickTime >= Config.TICK_MS) {
      ResourceManager.applyTick();
      lastTickTime = now;
    }

    // HUD
    UIManager.updateHUD();

    // Render
    SceneManager.getRenderer().render(SceneManager.getScene(), SceneManager.getCamera());
  }

  return { start };
})();

/* ════════════════════════════════════════════════
   RESTART
   ════════════════════════════════════════════════ */
function restartGame() {
  // Clear grid meshes
  for (let x = 0; x < Config.GRID_W; x++) {
    for (let z = 0; z < Config.GRID_H; z++) {
      const cell = State.grid[x]?.[z];
      if (cell) SceneManager.getScene().remove(cell.mesh);
      if (State.grid[x]) State.grid[x][z] = null;
    }
  }

  // Reset state
  Object.assign(State, {
    money: 5000, energy: 200, population: 0, satisfaction: 50,
    year: 2040,  tick: 0,    energyCrisisTicks: 0,
    paused: false, gameOver: false,
    selectedCell: null, buildMode: 'build', selectedType: null,
  });

  SceneManager.setCrisisMode(false);
  UIManager.hideOverlay();
  document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-build-mode').classList.add('active');
}

/* ════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════ */
(function boot() {
  SceneManager.init();
  GridManager.init();
  InputManager.init();
  GameLoop.start();

  // Welcome toast
  setTimeout(() => UIManager.toast('Welcome to MacroCity 2040! Click a cell to build.', 'ok'), 500);
  setTimeout(() => UIManager.toast('Balance energy production with city growth.', 'warn'), 2200);
})();
