// Scena 3D della home: un dente lucido che si muove con lo scorrimento della pagina
// e, nell'ultimo capitolo, dieci spazzolini (uno per lezione). Usa three.js r128.

let threePromise;
/** Carica three.js solo quando serve (la home), dalla copia inclusa nel sito. */
export function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  threePromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/three.min.js', import.meta.url).href;
    s.onload = () => resolve(window.THREE);
    s.onerror = reject;
    document.head.append(s);
  });
  return threePromise;
}

// Lo stesso dente del logo (favicon.svg), in un riquadro 64×64.
const TOOTH_PATH = 'M21 17c-5 0-8 4-8 10 0 5 2 9 3 13 1 5 2 10 5 10 3 0 3-6 5-10 1-2 2-3 6-3s5 1 6 3c2 4 2 10 5 10 3 0 4-5 5-10 1-4 3-8 3-13 0-6-3-10-8-10-4 0-6 2-11 2s-7-2-11-2z';

function toothShape(THREE) {
  const tokens = TOOTH_PATH.match(/[a-zA-Z]|-?\d*\.?\d+/g);
  const shape = new THREE.Shape();
  const P = (px, py) => [px - 32, -(py - 33.5)];
  let i = 0, cmd = '', x = 0, y = 0, lastCtrl = null;
  const n = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M') {
      x = n(); y = n();
      shape.moveTo(...P(x, y));
    } else if (cmd === 'c') {
      const x1 = x + n(), y1 = y + n(), x2 = x + n(), y2 = y + n(), ex = x + n(), ey = y + n();
      shape.bezierCurveTo(...P(x1, y1), ...P(x2, y2), ...P(ex, ey));
      lastCtrl = [x2, y2]; x = ex; y = ey;
    } else if (cmd === 's') {
      const x1 = lastCtrl ? 2 * x - lastCtrl[0] : x, y1 = lastCtrl ? 2 * y - lastCtrl[1] : y;
      const x2 = x + n(), y2 = y + n(), ex = x + n(), ey = y + n();
      shape.bezierCurveTo(...P(x1, y1), ...P(x2, y2), ...P(ex, ey));
      lastCtrl = [x2, y2]; x = ex; y = ey;
    } else if (cmd === 'z' || cmd === 'Z') {
      shape.closePath();
      cmd = '';
    } else {
      i++; // comando non usato dal tracciato
    }
  }
  return shape;
}

/**
 * Dente "gonfio" come le icone 3D: una superficie a cuscino calcolata su una griglia,
 * alta al centro e arrotondata verso il contorno del logo, specchiata sul retro.
 */
function toothGeometry(THREE) {
  const poly = toothShape(THREE).getPoints(240).map((p) => [p.x, p.y]);
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs) - 1, maxX = Math.max(...xs) + 1, minY = Math.min(...ys) - 1, maxY = Math.max(...ys) + 1;
  const N = 200, T = 7.5, D = 8;

  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const nearest = (x, y) => {
    let best = Infinity, bx = 0, by = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [cx, cy] = poly[i];
      const dx = cx - ax, dy = cy - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const px = ax + t * dx, py = ay + t * dy;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < best) { best = d; bx = px; by = py; }
    }
    return [bx, by, Math.sqrt(best)];
  };

  // Griglia: per ogni punto, dentro/fuori e distanza dal contorno.
  const cols = N + 1;
  const info = [];
  for (let r = 0; r <= N; r++) {
    for (let c = 0; c <= N; c++) {
      const x = minX + ((maxX - minX) * c) / N, y = minY + ((maxY - minY) * r) / N;
      const [nx, ny, d] = nearest(x, y);
      info.push({ x, y, nx, ny, d, in: inside(x, y) });
    }
  }
  // Un punto esterno vicino a uno interno viene "agganciato" al contorno.
  const keep = info.map((v, k) => {
    if (v.in) return true;
    const r = Math.floor(k / cols), c = k % cols;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr <= N && cc >= 0 && cc <= N && info[rr * cols + cc].in) return true;
    }
    return false;
  });

  const pos = [], idx = [];
  const height = (v) => (v.in ? T * Math.sqrt(1 - (1 - Math.min(v.d / D, 1)) ** 2) : 0);
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    info.forEach((v) => {
      if (v.in) pos.push(v.x, v.y, side * height(v));
      else pos.push(v.nx, v.ny, 0);
    });
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
        for (const tri of [[a, d, b], [b, d, e]]) {
          if (!tri.every((k) => keep[k]) || !tri.some((k) => info[k].in)) continue;
          const [i0, i1, i2] = side === 1 ? tri : [tri[0], tri[2], tri[1]];
          idx.push(base + i0, base + i1, base + i2);
        }
      }
    }
  }
  // Levigatura: ogni punto interno si avvicina alla media dei vicini (il contorno resta fermo),
  // così spariscono i piccoli gradini della griglia lungo i fianchi.
  const count = info.length;
  for (let pass = 0; pass < 3; pass++) {
    for (const off of [0, count]) {
      const src = pos.slice(off * 3, (off + count) * 3);
      for (let k = 0; k < count; k++) {
        if (!info[k].in) continue;
        const r = Math.floor(k / cols), c = k % cols;
        let sx = 0, sy = 0, sz = 0, m = 0;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr > N || cc < 0 || cc > N) continue;
          const q = rr * cols + cc;
          if (!keep[q]) continue;
          sx += src[q * 3]; sy += src[q * 3 + 1]; sz += src[q * 3 + 2]; m++;
        }
        if (!m) continue;
        const o = (off + k) * 3;
        pos[o] = src[k * 3] * 0.5 + (sx / m) * 0.5;
        pos[o + 1] = src[k * 3 + 1] * 0.5 + (sy / m) * 0.5;
        pos[o + 2] = src[k * 3 + 2] * 0.5 + (sz / m) * 0.5;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.center();
  geo.scale(1 / 19, 1 / 19, 1 / 19);
  return geo;
}

function makeTooth(THREE) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xf2f7ff, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.35,
  });
  return new THREE.Mesh(toothGeometry(THREE), mat);
}

function brushShape(THREE) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.26);
  s.lineTo(3.3, -0.26);
  s.quadraticCurveTo(3.8, -0.26, 4.0, -0.14);
  s.lineTo(4.35, -0.14);
  s.quadraticCurveTo(4.5, -0.22, 4.7, -0.22);
  s.lineTo(5.7, -0.22);
  s.quadraticCurveTo(5.95, -0.22, 5.95, 0);
  s.quadraticCurveTo(5.95, 0.22, 5.7, 0.22);
  s.lineTo(4.7, 0.22);
  s.quadraticCurveTo(4.5, 0.22, 4.35, 0.14);
  s.lineTo(4.0, 0.14);
  s.quadraticCurveTo(3.8, 0.26, 3.3, 0.26);
  s.lineTo(0, 0.26);
  s.quadraticCurveTo(-0.26, 0.26, -0.26, 0);
  s.quadraticCurveTo(-0.26, -0.26, 0, -0.26);
  return s;
}

function makeBrushes(THREE, colors) {
  const handleGeo = new THREE.ExtrudeGeometry(brushShape(THREE), {
    depth: 0.16, curveSegments: 24, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 6,
  });
  const bristleGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.42, 8);
  bristleGeo.rotateX(Math.PI / 2);
  const bristleMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 });
  const tuft = [];
  for (let bx = 4.78; bx <= 5.75; bx += 0.138) for (const by of [-0.12, 0, 0.12]) tuft.push([bx, by]);
  const white = new THREE.Color(0xffffff), blue = new THREE.Color(0x7dd3fc);

  return colors.map((hex) => {
    const group = new THREE.Group();
    const handle = new THREE.Mesh(handleGeo, new THREE.MeshPhysicalMaterial({
      color: hex, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1,
    }));
    const bristles = new THREE.InstancedMesh(bristleGeo, bristleMat, tuft.length);
    const m = new THREE.Matrix4();
    tuft.forEach(([bx, by], k) => {
      m.makeTranslation(bx, by, 0.16 + 0.08 + 0.2);
      bristles.setMatrixAt(k, m);
      bristles.setColorAt(k, k % 3 === 1 ? blue : white);
    });
    const inner = new THREE.Group();
    inner.add(handle, bristles);
    inner.position.x = -2.85; // ruota attorno al centro dello spazzolino
    group.add(inner);
    group.scale.setScalar(0.42);
    return group;
  });
}

function makeBadgeRing(THREE) {
  const hex = (r) => Array.from({ length: 6 }, (_, k) => {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  });
  const outer = new THREE.Shape(hex(1.85));
  outer.holes.push(new THREE.Path(hex(1.64).reverse()));
  const geo = new THREE.ExtrudeGeometry(outer, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4 });
  geo.center();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x60a5fa, metalness: 0.6, roughness: 0.18, clearcoat: 1, emissive: 0x1d4ed8, emissiveIntensity: 0.35 });
  return new THREE.Mesh(geo, mat);
}

function makeShadow(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(2,6,23,.55)');
  grad.addColorStop(1, 'rgba(2,6,23,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2.4;
  return mesh;
}

/** Ambiente "da studio fotografico" per i riflessi sui materiali lucidi. */
function studioEnvironment(THREE, renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x0b1530, side: THREE.BackSide })));
  const panel = (w, h, color, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(9, 3, 0xffffff, [0, 8, 3]);
  panel(4, 9, 0xdbeafe, [-8, 1, 4]);
  panel(4, 9, 0x60a5fa, [8, 0, -2]);
  panel(10, 2, 0x93c5fd, [0, -8, 5]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Pose del dente per ogni capitolo: 0 apertura, 1-3 i tre passi, 4 le dieci lezioni.
 * x/y posizione, rx/ry/rz rotazione, s scala, ring = anello del badge, brush = spazzolini.
 */
function keyframes(narrow) {
  const side = narrow ? 0 : 1.9;
  const up = narrow ? 0.95 : 0;
  const k = narrow ? 0.78 : 1;
  return [
    { x: 0, y: narrow ? 1.25 : 0.1, rx: 0.08, ry: 0, rz: 0, s: (narrow ? 0.85 : 1) * k, ring: 0, brush: 0 },
    { x: side, y: up, rx: 0.18, ry: 0.85, rz: -0.12, s: 1.15 * k, ring: 0, brush: 0 },
    { x: side, y: up + 0.05, rx: -0.12, ry: -0.75, rz: 0.16, s: 1.15 * k, ring: 0, brush: 0 },
    { x: side, y: up, rx: 0, ry: Math.PI * 2, rz: 0, s: 0.95 * k, ring: 1, brush: 0 },
    { x: side * 0.6, y: 3.2, rx: 0.4, ry: Math.PI * 2.4, rz: 0, s: 0.001, ring: 0, brush: 1 },
  ];
}

export async function createStoryScene(canvas, { reducedMotion = false } = {}) {
  const THREE = await loadThree();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null; // WebGL non disponibile: la pagina mostra l'immagine statica
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(THREE, renderer);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  scene.add(new THREE.AmbientLight(0x9db8ff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(3, 5, 6); scene.add(key);
  const rimA = new THREE.DirectionalLight(0x38bdf8, 2.4); rimA.position.set(-5, 2, -4); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0x818cf8, 1.8); rimB.position.set(5, -2, -5); scene.add(rimB);

  const tooth = makeTooth(THREE);
  const toothPivot = new THREE.Group();
  toothPivot.add(tooth);
  scene.add(toothPivot);

  const ring = makeBadgeRing(THREE);
  toothPivot.add(ring);
  ring.scale.setScalar(0.001);

  const shadow = makeShadow(THREE);
  scene.add(shadow);

  const palette = [0x1d4ed8, 0x0ea5e9, 0x6366f1, 0x22d3ee, 0x2563eb, 0x818cf8, 0x0891b2, 0x3b82f6, 0xa5b4fc, 0x38bdf8];
  const brushes = makeBrushes(THREE, palette);
  const lineup = new THREE.Group();
  brushes.forEach((b) => lineup.add(b));
  scene.add(lineup);

  let narrow = false, frames = keyframes(false), lineupScale = 1;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    narrow = camera.aspect < 0.9;
    frames = keyframes(narrow);
    lineupScale = narrow ? 0.85 : 1;
  }
  resize();

  const state = { x: 0, y: 0.2, rx: 0, ry: 0, rz: 0, s: 1, ring: 0, brush: 0 };
  const pointer = { x: 0, y: 0 };
  let progress = 0, running = false, raf = 0;
  const t0 = performance.now();

  function target() {
    const t = progress * (frames.length - 1);
    const i = Math.min(frames.length - 2, Math.floor(t));
    const f = smooth(clamp01(t - i));
    const a = frames[i], b = frames[i + 1];
    const out = {};
    for (const k in a) out[k] = lerp(a[k], b[k], f);
    return { out, t };
  }

  function frame(now) {
    const time = reducedMotion ? 0 : (now - t0) / 1000;
    const { out, t } = target();
    const ease = reducedMotion ? 1 : 0.085;
    for (const k in out) state[k] += (out[k] - state[k]) * ease;

    const idle = clamp01(1 - t); // movimento libero solo in apertura
    toothPivot.position.set(state.x, state.y + Math.sin(time * 1.3) * 0.07, 0);
    toothPivot.rotation.set(
      state.rx + pointer.y * 0.18,
      state.ry + Math.sin(time * 0.55) * 0.55 * idle + pointer.x * 0.3,
      state.rz,
    );
    toothPivot.scale.setScalar(Math.max(0.001, state.s));
    toothPivot.visible = state.s > 0.06;
    ring.scale.setScalar(Math.max(0.001, state.ring * 1.12));
    ring.rotation.z = time * 0.4;
    ring.visible = state.ring > 0.01;

    shadow.position.set(state.x, state.y - 1.35 * Math.max(0.2, state.s), -0.3);
    shadow.scale.setScalar(Math.max(0.001, state.s));
    shadow.material.opacity = clamp01(state.s * 1.2) * 0.9;

    lineup.visible = state.brush > 0.01;
    lineup.scale.setScalar(lineupScale);
    brushes.forEach((b, k) => {
      const a = smooth(clamp01(state.brush * 1.7 - k * 0.07));
      // Fila in diagonale che si allontana verso destra, come una vetrina di prodotti.
      const tx = (narrow ? -1.2 : -0.5) + k * (narrow ? 0.4 : 0.5);
      const ty = (narrow ? 0.95 : -0.55) + k * 0.12;
      const tz = 1.3 - k * 1.0;
      b.position.set(lerp(tx + 7, tx, a), lerp(ty - 2, ty, a), tz);
      b.rotation.set(0.1, -0.5 + Math.sin(time * 0.8 + k) * 0.1, Math.PI / 2 + 0.22 + (1 - a) * 0.9);
    });

    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }

  return {
    setProgress(p) {
      progress = clamp01(p);
      if (!running) requestAnimationFrame(frame);
    },
    setPointer(x, y) { if (!reducedMotion) { pointer.x = x; pointer.y = y; } },
    start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize,
    dispose() {
      this.stop();
      scene.traverse((o) => {
        o.geometry?.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m?.map?.dispose(); m?.dispose(); });
      });
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
