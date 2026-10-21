// Piece Metadata & Pure Retro Color Palettes
const PIECE_METADATA = {
  '0': { name: "flat-R", color: "blue", cubes: 5 },
  '1': { name: "flat-X-plus", color: "red", cubes: 5 },
  '2': { name: "flat-W", color: "yellow", cubes: 5 },
  '3': { name: "bent-W-tip", color: "red", cubes: 5 },
  '4': { name: "folded-X", color: "yellow", cubes: 5 },
  '5': { name: "z-bump", color: "red", cubes: 5 },
  '6': { name: "bent-T", color: "blue", cubes: 5 },
  '7': { name: "tall-L-bump", color: "red", cubes: 5 },
  '8': { name: "twisted-Z", color: "yellow", cubes: 5 },
  '9': { name: "L-bump-end", color: "yellow", cubes: 5 },
  'A': { name: "squiggle", color: "blue", cubes: 5 },
  'B': { name: "bent-R-tip", color: "blue", cubes: 5 },
  'C': { name: "squiggle (tetracube)", color: "yellow", cubes: 4 }
};

const COLOR_BLUE = 0x0055ff, COLOR_RED = 0xee1111, COLOR_YELLOW = 0xffcc00;
const RETRO_PIECE_PALETTE = {
  '0': COLOR_BLUE, '6': COLOR_BLUE, 'A': COLOR_BLUE, 'B': COLOR_BLUE,
  '1': COLOR_RED,  '3': COLOR_RED,  '5': COLOR_RED,  '7': COLOR_RED,
  '2': COLOR_YELLOW, '4': COLOR_YELLOW, '8': COLOR_YELLOW, '9': COLOR_YELLOW, 'C': COLOR_YELLOW
};

// Global State
let solutionsBuffer = null, totalSolutions = 0, currentSolIdx = 0, previousStepCount = 13;
let pieceMeshes = [], selectedGroup = null, playTimer = null;
const coordMatrix = new THREE.Matrix4().identity();

// Three.js Scene Setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(7.5, 8.5, 10.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.NoToneMapping;
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight1.position.set(12, 20, 16);
scene.add(dirLight1);
const dirLight2 = new THREE.DirectionalLight(0x64748b, 0.35);
dirLight2.position.set(-10, -10, -10);
scene.add(dirLight2);

// Physical 5-Sided Clear Plastic Box Wireframe
const boxGroup = new THREE.Group();
scene.add(boxGroup);
boxGroup.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(4.02, 4.02, 4.02)),
  new THREE.LineBasicMaterial({ color: 0x64748b, opacity: 0.45, transparent: true })
));

const pieceGroup = new THREE.Group();
scene.add(pieceGroup);
const borderMat = new THREE.LineBasicMaterial({ color: 0x111827, linewidth: 2.5 });

// Robust Manifold Boundary Geometry Builder
function buildPieceGeometry(cubes) {
  const voxelSet = new Set(cubes.map(c => `${c.x},${c.y},${c.z}`));
  const positions = [];
  const normals = [];

  const FACES = [
    { dir: [ 1,  0,  0], corners: [[.5,-.5,-.5], [.5, .5,-.5], [.5, .5, .5], [.5,-.5, .5]], norm: [ 1,  0,  0] },
    { dir: [-1,  0,  0], corners: [[-.5,-.5, .5], [-.5, .5, .5], [-.5, .5,-.5], [-.5,-.5,-.5]], norm: [-1,  0,  0] },
    { dir: [ 0,  1,  0], corners: [[-.5, .5,-.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5,-.5]], norm: [ 0,  1,  0] },
    { dir: [ 0, -1,  0], corners: [[-.5,-.5, .5], [-.5,-.5,-.5], [.5,-.5,-.5], [.5,-.5, .5]], norm: [ 0, -1,  0] },
    { dir: [ 0,  0,  1], corners: [[-.5,-.5, .5], [.5,-.5, .5], [.5, .5, .5], [-.5, .5, .5]], norm: [ 0,  0,  1] },
    { dir: [ 0,  0, -1], corners: [[.5,-.5,-.5], [-.5,-.5,-.5], [-.5, .5,-.5], [.5, .5,-.5]], norm: [ 0,  0, -1] }
  ];

  cubes.forEach(c => {
    FACES.forEach(face => {
      const neighborKey = `${c.x + face.dir[0]},${c.y + face.dir[1]},${c.z + face.dir[2]}`;
      if (!voxelSet.has(neighborKey)) {
        const v = face.corners.map(crn => [
          (c.x + crn[0]) - 1.5,
          (c.y + crn[1]) - 1.5,
          (c.z + crn[2]) - 1.5
        ]);

        // Triangle 1 (0 -> 1 -> 2)
        positions.push(...v[0], ...v[1], ...v[2]);
        normals.push(...face.norm, ...face.norm, ...face.norm);

        // Triangle 2 (0 -> 2 -> 3)
        positions.push(...v[0], ...v[2], ...v[3]);
        normals.push(...face.norm, ...face.norm, ...face.norm);
      }
    });
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  return THREE.BufferGeometryUtils.mergeVertices(geo, 1e-4);
}

// Coordinate Ingestion & Voxel Transformation
function getRawSolution(idx) {
  const offset = idx * 32, raw = new Map();
  for (let i = 0; i < 64; i++) {
    const byte = solutionsBuffer[offset + (i >> 1)];
    const pId = ((i % 2 === 0 ? byte >> 4 : byte & 0x0F)).toString(16).toUpperCase();
    const vec = new THREE.Vector3((i % 4) - 1.5, Math.floor(i / 16) - 1.5, (Math.floor(i / 4) % 4) - 1.5).applyMatrix4(coordMatrix);
    const pt = { x: Math.round(vec.x + 1.5), y: Math.round(vec.y + 1.5), z: Math.round(vec.z + 1.5) };
    if (!raw.has(pId)) raw.set(pId, []);
    raw.get(pId).push(pt);
  }
  return raw;
}

// Top-Down Dependency Graph Sorter (Topological clearance)
function sortTopDownClearance(rawPieces) {
  const pieces = Array.from(rawPieces.entries());
  const n = pieces.length, grid = new Map();
  pieces.forEach(([pId, cubes], idx) => cubes.forEach(c => grid.set(`${c.x},${c.y},${c.z}`, idx)));

  const blockedBy = Array.from({ length: n }, () => new Set());
  const inDegree = Array(n).fill(0);

  for (let p = 0; p < n; p++) {
    pieces[p][1].forEach(c => {
      for (let higherY = c.y + 1; higherY < 4; higherY++) {
        const higherIdx = grid.get(`${c.x},${higherY},${c.z}`);
        if (higherIdx !== undefined && higherIdx !== p && !blockedBy[p].has(higherIdx)) {
          blockedBy[p].add(higherIdx);
        }
      }
    });
  }

  for (let p = 0; p < n; p++) blockedBy[p].forEach(q => inDegree[q]++);
  const queue = [], sorted = [];
  for (let i = 0; i < n; i++) if (inDegree[i] === 0) queue.push(i);

  while (queue.length > 0) {
    queue.sort((a, b) => {
      const aY = pieces[a][1].reduce((s, c) => s + c.y, 0) / pieces[a][1].length;
      const bY = pieces[b][1].reduce((s, c) => s + c.y, 0) / pieces[b][1].length;
      return aY - bY;
    });
    const curr = queue.shift();
    sorted.push(pieces[curr]);
    blockedBy[curr].forEach(q => { if (--inDegree[q] === 0) queue.push(q); });
  }

  if (sorted.length < n) pieces.forEach(p => { if (!sorted.includes(p)) sorted.push(p); });
  return sorted;
}

function displaySolution(idx) {
  selectPiece(null);
  while (pieceGroup.children.length > 0) pieceGroup.remove(pieceGroup.children[0]);
  pieceMeshes = [];

  const sortedPieces = sortTopDownClearance(getRawSolution(idx));
  sortedPieces.forEach(([pieceId, cubes]) => {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: RETRO_PIECE_PALETTE[pieceId] || 0xffffff,
      roughness: 0.25,
      metalness: 0.05
    });

    let cx = 0, cy = 0, cz = 0;
    cubes.forEach(c => { cx += c.x; cy += c.y; cz += c.z; });
    const geo = buildPieceGeometry(cubes);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { parentGroup: group };
    group.add(mesh);
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), borderMat));

    group.userData = {
      pieceId,
      minY: Math.min(...cubes.map(c => c.y)),
      cubes,
      mesh,
      centroid: new THREE.Vector3(cx / cubes.length - 1.5, cy / cubes.length - 1.5, cz / cubes.length - 1.5),
      dropOffset: 0,
      animating: false,
      animStartTime: 0,
      animDuration: 350
    };
    pieceGroup.add(group);
    pieceMeshes.push(group);
  });

  rebuildTrayList();
  previousStepCount = parseInt(document.getElementById('stepRange').value, 10);
  updateFilters(false);
}

function checkVerticalClearance(candidateIdx, currentStep) {
  const targetCubes = pieceMeshes[candidateIdx].userData.cubes;
  const targetCols = new Set(targetCubes.map(c => `${c.x},${c.z}`));
  for (let i = 0; i < currentStep; i++) {
    if (i === candidateIdx) continue;
    for (const pc of pieceMeshes[i].userData.cubes) {
      if (targetCols.has(`${pc.x},${pc.z}`) && targetCubes.some(tc => tc.x === pc.x && tc.z === pc.z && tc.y < pc.y)) {
        return false;
      }
    }
  }
  return true;
}

function updateFilters(shouldAnimate = false) {
  const maxSteps = parseInt(document.getElementById('stepRange').value, 10);
  const maxLayerY = parseInt(document.getElementById('layerRange').value, 10);
  const now = performance.now();

  pieceMeshes.forEach((group, idx) => {
    const shouldBeVisible = idx < maxSteps;
    const layerVisible = group.userData.minY <= maxLayerY;
    const prevVisible = group.visible;

    if (shouldAnimate && shouldBeVisible && layerVisible && !prevVisible && idx >= previousStepCount - 1) {
      group.userData.animating = true;
      group.userData.animStartTime = now;
      group.userData.dropOffset = 5.0;
    } else if (!shouldBeVisible || !layerVisible) {
      group.userData.animating = false;
      group.userData.dropOffset = 0;
    }

    group.visible = shouldBeVisible && layerVisible;
  });

  previousStepCount = maxSteps;
  updateTrayUI();
}

// Orientation & Re-baking
function rotateCoordinateSpace(axis, angleDeg) {
  const rotM = new THREE.Matrix4()[`makeRotation${axis.toUpperCase()}`](THREE.MathUtils.degToRad(angleDeg));
  coordMatrix.premultiply(rotM);
  for (let i = 0; i < 16; i++) coordMatrix.elements[i] = Math.round(coordMatrix.elements[i]);
  displaySolution(currentSolIdx);
}

function resetCoordinateSpace() {
  coordMatrix.identity();
  displaySolution(currentSolIdx);
}

// Dynamic Rotation Button Builder
const rotContainer = document.getElementById('rot-btn-group');
[
  { l: 'X▲', a: 'x', d: -90, t: 'Pitch Up (X)' },
  { l: 'X▼', a: 'x', d: 90,  t: 'Pitch Down (Shift+X)' },
  { l: 'Y◄', a: 'y', d: -90, t: 'Yaw Left (Shift+Y)' },
  { l: 'Y►', a: 'y', d: 90,  t: 'Yaw Right (Y)' },
  { l: 'Z↺', a: 'z', d: 90,  t: 'Roll Left (Shift+Z)' },
  { l: 'Z↻', a: 'z', d: -90, t: 'Roll Right (Z)' },
  { l: '⟲', reset: true, t: 'Reset (O)' }
].forEach(a => {
  const btn = document.createElement('button');
  btn.className = 'rot-btn';
  btn.textContent = a.l;
  btn.title = a.t;
  btn.onclick = a.reset ? resetCoordinateSpace : () => rotateCoordinateSpace(a.a, a.d);
  rotContainer.appendChild(btn);
});

// Selection & Raycasting
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
function selectPiece(group) {
  if (selectedGroup) selectedGroup.userData.mesh.material.emissive.setHex(0x000000);
  const card = document.getElementById('piece-card');
  if (!group) {
    selectedGroup = null;
    card.style.display = 'none';
    syncTraySelection(null);
    return;
  }
  selectedGroup = group;
  selectedGroup.userData.mesh.material.emissive.setHex(0x555555);

  const pId = group.userData.pieceId;
  const meta = PIECE_METADATA[pId] || { name: `Piece ${pId}`, color: "unknown", cubes: 5 };
  document.getElementById('card-swatch').style.backgroundColor = '#' + (RETRO_PIECE_PALETTE[pId] || 0xffffff).toString(16).padStart(6, '0');
  document.getElementById('card-name').textContent = `Piece ${pId}: "${meta.name}"`;
  document.getElementById('card-desc').textContent = `${meta.cubes} cubes | Group: ${meta.color.toUpperCase()}`;
  card.style.display = 'block';
  syncTraySelection(pId);
}

window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#ui-overlay, #piece-card, #tray-sidebar')) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(pieceMeshes.filter(g => g.visible).map(g => g.userData.mesh), false);
  selectPiece(hits.length > 0 ? hits[0].object.userData.parentGroup : null);
});

// Tray Sidebar Implementation
const trayList = document.getElementById('tray-list');
function swapPieceOrder(a, b) {
  if (a < 0 || a >= pieceMeshes.length || b < 0 || b >= pieceMeshes.length) return;
  [pieceMeshes[a], pieceMeshes[b]] = [pieceMeshes[b], pieceMeshes[a]];
  rebuildTrayList();
  updateFilters(false);
}

function rebuildTrayList() {
  trayList.innerHTML = '';
  pieceMeshes.forEach((group, idx) => {
    const pId = group.userData.pieceId;
    const meta = PIECE_METADATA[pId] || { name: `Piece ${pId}` };
    const hex = '#' + (RETRO_PIECE_PALETTE[pId] || 0xffffff).toString(16).padStart(6, '0');

    const item = document.createElement('div');
    item.className = 'tray-item';
    item.dataset.pieceId = pId;
    item.innerHTML = `
      <span class="color-swatch" style="background-color: ${hex}"></span>
      <span style="font-size: 0.76rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px;"><strong>${idx + 1}.</strong> ${pId}: ${meta.name}</span>
      <div class="order-controls">
        <button class="order-btn" title="Move earlier">▲</button>
        <button class="order-btn" title="Move later">▼</button>
      </div>
      <span class="tray-item-status">In Tray</span>
    `;

    item.querySelector('span:nth-child(2)').onclick = () => {
      if (idx >= parseInt(stepRange.value, 10)) setStep(idx + 1, true);
      selectPiece(group);
    };
    const [upBtn, dnBtn] = item.querySelectorAll('.order-btn');
    upBtn.onclick = (e) => { e.stopPropagation(); swapPieceOrder(idx, idx - 1); };
    dnBtn.onclick = (e) => { e.stopPropagation(); swapPieceOrder(idx, idx + 1); };
    trayList.appendChild(item);
  });
  updateTrayUI();
}

function updateTrayUI() {
  const maxSteps = parseInt(stepRange.value, 10);
  document.getElementById('placed-tray-count').textContent = maxSteps;
  trayList.querySelectorAll('.tray-item').forEach((item, idx) => {
    const isPlaced = idx < maxSteps;
    const isClear = isPlaced ? true : checkVerticalClearance(idx, maxSteps);
    item.classList.toggle('placed', isPlaced);
    item.classList.toggle('waiting', !isPlaced);
    item.classList.toggle('blocked', !isPlaced && !isClear);
    item.querySelector('.tray-item-status').textContent = isPlaced ? 'Placed' : (isClear ? 'Clear' : 'Blocked');
  });
}

function syncTraySelection(selectedId) {
  trayList.querySelectorAll('.tray-item').forEach(el => {
    const active = selectedId && el.dataset.pieceId === selectedId;
    el.classList.toggle('active-selection', active);
    if (active) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

// Stepper & Playback Functions
function setStep(newVal, shouldAnimate = true) {
  newVal = Math.max(1, Math.min(13, newVal));
  const isAdvancing = newVal > parseInt(stepRange.value, 10);
  stepRange.value = newVal;
  stepCount.textContent = newVal;
  updateFilters(shouldAnimate && isAdvancing);
}

function stopPlayback() {
  if (playTimer !== null) { clearInterval(playTimer); playTimer = null; playBtn.textContent = '▶ Play'; }
}

function togglePlayback() {
  if (playTimer !== null) {
    stopPlayback();
  } else {
    if (parseInt(stepRange.value, 10) >= 13) setStep(1, false);
    playBtn.textContent = '⏸ Pause';
    playTimer = setInterval(() => {
      const v = parseInt(stepRange.value, 10);
      if (v < 13) setStep(v + 1, true); else stopPlayback();
    }, 800);
  }
}

function goToSolution(newIdx) {
  stopPlayback();
  currentSolIdx = (newIdx + totalSolutions) % totalSolutions;
  solInput.value = currentSolIdx + 1;
  displaySolution(currentSolIdx);
}

// Global Event Mapping
const clickBindings = {
  prevSol: () => goToSolution(currentSolIdx - 1),
  nextSol: () => goToSolution(currentSolIdx + 1),
  randSol: () => goToSolution(Math.floor(Math.random() * totalSolutions)),
  playBtn: togglePlayback,
  stepPrev: () => { stopPlayback(); setStep(parseInt(stepRange.value, 10) - 1, false); },
  stepNext: () => { stopPlayback(); setStep(parseInt(stepRange.value, 10) + 1, true); },
  autoSortBtn: () => displaySolution(currentSolIdx),
  'tray-toggle-btn': () => document.getElementById('tray-sidebar').classList.toggle('collapsed')
};

Object.entries(clickBindings).forEach(([id, handler]) => {
  const el = document.getElementById(id);
  if (el) el.onclick = handler;
});

solInput.onchange = (e) => goToSolution((parseInt(e.target.value, 10) || 1) - 1);
stepRange.oninput = (e) => { stopPlayback(); stepCount.textContent = e.target.value; updateFilters(false); };
explodeRange.oninput = () => updateFilters(false);
layerRange.oninput = (e) => {
  document.getElementById('layerCount').textContent = e.target.value === "3" ? "All" : `<= ${e.target.value}`;
  updateFilters(false);
};

window.onkeydown = (e) => {
  if (document.activeElement.tagName === 'INPUT') return;
  const actions = {
    ' ': () => { e.preventDefault(); togglePlayback(); },
    'ArrowRight': () => { e.preventDefault(); stopPlayback(); setStep(parseInt(stepRange.value, 10) + 1, true); },
    'ArrowLeft': () => { e.preventDefault(); stopPlayback(); setStep(parseInt(stepRange.value, 10) - 1, false); },
    'ArrowUp': () => { e.preventDefault(); goToSolution(currentSolIdx + 1); },
    'ArrowDown': () => { e.preventDefault(); goToSolution(currentSolIdx - 1); },
    'x': () => rotateCoordinateSpace('x', e.shiftKey ? 90 : -90),
    'y': () => rotateCoordinateSpace('y', e.shiftKey ? -90 : 90),
    'z': () => rotateCoordinateSpace('z', e.shiftKey ? -90 : 90),
    'o': resetCoordinateSpace,
    'r': () => goToSolution(Math.floor(Math.random() * totalSolutions)),
    't': () => document.getElementById('tray-sidebar').classList.toggle('collapsed'),
    'Escape': () => selectPiece(null)
  };
  if (actions[e.key]) actions[e.key]();
};

window.onresize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  const now = performance.now();
  const explodeFactor = parseFloat(explodeRange.value);

  pieceMeshes.forEach(group => {
    if (group.userData.animating) {
      const progress = Math.min(1.0, (now - group.userData.animStartTime) / group.userData.animDuration);
      group.userData.dropOffset = (1.0 - (1 - Math.pow(1 - progress, 3))) * 5.0;
      if (progress >= 1.0) { group.userData.animating = false; group.userData.dropOffset = 0; }
    }
    const offset = group.userData.centroid.clone().normalize().multiplyScalar(explodeFactor * 2.2);
    group.position.set(offset.x, offset.y + group.userData.dropOffset, offset.z);
  });
  renderer.render(scene, camera);
}

// Initializer
async function init() {
  try {
    if (window.BEDLAM_BINARY_B64) {
      const bStr = atob(window.BEDLAM_BINARY_B64);
      solutionsBuffer = new Uint8Array(bStr.length);
      for (let i = 0; i < bStr.length; i++) solutionsBuffer[i] = bStr.charCodeAt(i);
    } else {
      const res = await fetch('bedlam_solutions.bin');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      solutionsBuffer = new Uint8Array(await res.arrayBuffer());
    }
    totalSolutions = Math.floor(solutionsBuffer.length / 32);
    document.getElementById('status-msg').textContent = `${totalSolutions.toLocaleString()} solutions ready`;
    solInput.max = totalSolutions;
    [prevSol, nextSol, randSol, playBtn, solInput].forEach(el => el.disabled = false);
    goToSolution(0);
    animate();
  } catch (err) {
    const s = document.getElementById('status-msg');
    s.style.color = '#ef4444';
    s.textContent = `Could not load dataset. Check server or solutions_data.js.`;
  }
}

init();