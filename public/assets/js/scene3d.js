// Mondo 3D della home: una tela fissa dietro la pagina. Ogni oggetto (dente, spazzolino,
// arcata) segue un "posto" nella pagina (un elemento con data-slot) e scorre con essa,
// un po' più lentamente del testo, ruotando mentre passa. Usa three.js r128.

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

/** Colore indicato in sRGB (come nei CSS), convertito nello spazio lineare usato dal rendering. */
const srgb = (THREE, hex) => new THREE.Color(hex).convertSRGBToLinear();

const modelUrl = (name) => new URL(`../models/${name}.bin`, import.meta.url).href;

/** Legge un modello generato da tools/build_models.py. */
async function loadModel(THREE, name) {
  const buf = await (await fetch(modelUrl(name))).arrayBuffer();
  const dv = new DataView(buf);
  const nv = dv.getUint32(0, true), ni = dv.getUint32(4, true);
  const min = [0, 1, 2].map((i) => dv.getFloat32(8 + i * 4, true));
  const max = [0, 1, 2].map((i) => dv.getFloat32(20 + i * 4, true));
  const q = new Uint16Array(buf, 32, nv * 3);
  const pos = new Float32Array(nv * 3);
  for (let i = 0; i < pos.length; i++) {
    const a = i % 3;
    pos[i] = min[a] + (q[i] / 65535) * (max[a] - min[a]);
  }
  const off = 32 + nv * 6;
  const idx = nv < 65536 ? new Uint16Array(buf.slice(off, off + ni * 2)) : new Uint32Array(buf.slice(off, off + ni * 4));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

// ---------- materiali e oggetti ----------

function enamel(THREE, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: srgb(THREE, 0xffffff), roughness: 0.26, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.22,
    envMapIntensity: 0.9, vertexColors: true, ...opts,
  });
}

/** Smalto bianco sulla corona, avorio più caldo scendendo lungo le radici. */
function paintTooth(THREE, geo, crownY = 0.0) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const white = srgb(THREE, 0xfbfbf8), ivory = srgb(THREE, 0xebdfc8), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (crownY - p.getY(i)) / 1.1));
    c.copy(white).lerp(ivory, t * t);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function centerGeometry(geo) {
  const b = geo.boundingBox;
  geo.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
  geo.computeBoundingBox();
  return geo;
}

function makeMolar(THREE, geo) {
  paintTooth(THREE, geo, 0.05);
  centerGeometry(geo);
  return new THREE.Mesh(geo, enamel(THREE));
}

function makeBrush(THREE, handleGeo, gripGeo) {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(handleGeo, new THREE.MeshPhysicalMaterial({
    color: srgb(THREE, 0x0a5bb5), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2,
  }));
  const grip = new THREE.Mesh(gripGeo, new THREE.MeshPhysicalMaterial({
    color: srgb(THREE, 0x9fd8f2), roughness: 0.55, metalness: 0, sheen: srgb(THREE, 0xffffff), envMapIntensity: 0.8,
  }));

  // Ciuffi di setole: cilindri con la punta arrotondata, disposti sull'ovale della testina.
  const profile = [];
  const R = 0.021, H = 0.25;
  profile.push(new THREE.Vector2(0, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, H - R));
  for (let k = 1; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    profile.push(new THREE.Vector2(Math.cos(a) * R, H - R + Math.sin(a) * R));
  }
  const tuftGeo = new THREE.LatheGeometry(profile, 10);
  tuftGeo.rotateX(Math.PI / 2);
  const spots = [];
  for (let x = 2.87; x <= 3.34; x += 0.052) {
    for (let y = -0.15; y <= 0.15; y += 0.052) {
      const ex = (x - 3.1) / 0.27, ey = y / 0.155;
      if (ex * ex + ey * ey <= 1) spots.push([x, y]);
    }
  }
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 }), spots.length);
  const m = new THREE.Matrix4(), white = srgb(THREE, 0xffffff), sky = srgb(THREE, 0x7ccbec);
  spots.forEach(([x, y], k) => {
    m.makeTranslation(x, y, 0.1);
    tufts.setMatrixAt(k, m);
    tufts.setColorAt(k, (Math.round((x - 2.87) / 0.052) + Math.round((y + 0.15) / 0.052)) % 3 === 0 ? sky : white);
  });

  const inner = new THREE.Group();
  inner.add(handle, grip, tufts);
  inner.position.set(-1.7, 0, -0.05); // ruota attorno al centro dello spazzolino
  group.add(inner);
  group.userData.height = 3.6;
  return group;
}

/** Arcata dentale stilizzata: corone su una base azzurra "di vetro". */
function makeArch(THREE, crowns) {
  const group = new THREE.Group();
  const order = ['molar', 'molar', 'premolar', 'premolar', 'canine', 'incisor', 'incisor'];
  const widths = [0.6, 0.64, 0.44, 0.45, 0.47, 0.4, 0.5];
  const side = order.map((t, i) => ({ t, w: widths[i] }));
  const teeth = [...side, ...side.slice().reverse()];
  const total = teeth.reduce((a, t) => a + t.w * 1.03, 0);

  // Curva a ferro di cavallo, scalata finché la sua lunghezza ospita tutti i denti.
  const span = (100 * Math.PI) / 180;
  const pts = (A, B) => Array.from({ length: 41 }, (_, i) => {
    const phi = -span + (2 * span * i) / 40;
    return new THREE.Vector3(A * Math.sin(phi), 0, B * Math.cos(phi) - B * 0.35);
  });
  let curve = new THREE.CatmullRomCurve3(pts(1, 1.15));
  const s = total / curve.getLength();
  curve = new THREE.CatmullRomCurve3(pts(s, 1.15 * s));

  const mat = enamel(THREE);
  let along = 0;
  const L = curve.getLength();
  teeth.forEach(({ t, w }) => {
    const u = (along + w * 0.515) / L;
    along += w * 1.03;
    const geo = crowns[t];
    const bb = geo.boundingBox;
    const scale = w / (bb.max.x - bb.min.x);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(scale);
    const p = curve.getPointAt(u), tan = curve.getTangentAt(u);
    mesh.position.copy(p);
    mesh.rotation.y = Math.atan2(-tan.z, tan.x);
    group.add(mesh);
  });

  const gum = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 120, 0.3, 24, false),
    new THREE.MeshPhysicalMaterial({
      color: srgb(THREE, 0x8fd0ec), roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
      transparent: true, opacity: 0.55, envMapIntensity: 1.2,
    }),
  );
  gum.scale.y = 0.55;
  gum.position.y = -0.05;
  group.add(gum);
  for (const end of [0, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), gum.material);
    cap.position.copy(curve.getPointAt(end)).setY(-0.05);
    cap.scale.y = 0.55;
    group.add(cap);
  }
  // Centra l'arcata sul suo punto medio.
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  group.children.forEach((o) => o.position.sub(c));
  const wrap = new THREE.Group();
  wrap.add(group);
  wrap.userData.height = box.max.z - box.min.z;
  return wrap;
}

function makeShadow(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,50,120,.28)');
  grad.addColorStop(1, 'rgba(0,50,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
}

/** Ambiente luminoso "da studio" per i riflessi su smalto e plastica. */
function studioEnvironment(THREE, renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: srgb(THREE, 0x6d8fb3), side: THREE.BackSide })));
  const panel = (w, h, color, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: srgb(THREE, color), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(10, 4, 0xffffff, [0, 8, 3]);
  panel(5, 9, 0xffffff, [-8, 1, 5]);
  panel(4, 9, 0x8fd0ec, [8, 0, 0]);
  panel(12, 3, 0xe8f4fb, [0, -8, 4]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Crea il mondo 3D sulla tela e collega gli oggetti agli elementi della pagina:
 * data-slot="molar" | "brush" | "arch". Restituisce null se WebGL non è disponibile.
 */
export async function createWorld(canvas, root, { reducedMotion = false } = {}) {
  const THREE = await loadThree();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const [molarGeo, handleGeo, gripGeo, cMolar, cPremolar, cCanine, cIncisor] = await Promise.all(
    ['molar', 'brush-handle', 'brush-grip', 'crown-molar', 'crown-premolar', 'crown-canine', 'crown-incisor'].map((n) => loadModel(THREE, n)),
  );

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(THREE, renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  scene.add(new THREE.HemisphereLight(srgb(THREE, 0xffffff), srgb(THREE, 0x9cc8e4), 0.35));
  const key = new THREE.DirectionalLight(srgb(THREE, 0xffffff), 1.7); key.position.set(-4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(srgb(THREE, 0x4db8e2), 1.6); rim.position.set(5, 1, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(srgb(THREE, 0xdcf1fa), 0.35); fill.position.set(4, -2, 6); scene.add(fill);

  // Oggetti
  const molar = makeMolar(THREE, molarGeo);
  const molarShadow = makeShadow(THREE);
  const brush = makeBrush(THREE, handleGeo, gripGeo);
  [cMolar, cPremolar, cCanine, cIncisor].forEach((g) => {
    paintTooth(THREE, g, 0.6);
    const b = g.boundingBox;
    g.translate(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2);
    g.computeBoundingBox();
  });
  const arch = makeArch(THREE, { molar: cMolar, premolar: cPremolar, canine: cCanine, incisor: cIncisor });

  const molarPivot = new THREE.Group(); molarPivot.add(molar); scene.add(molarPivot, molarShadow);
  const brushPivot = new THREE.Group(); brushPivot.add(brush); scene.add(brushPivot);
  const archPivot = new THREE.Group(); archPivot.add(arch); scene.add(archPivot);

  // Bollicine azzurre a profondità diverse: scorrono a velocità diverse e danno il senso del movimento.
  const bubbleMat = new THREE.MeshPhysicalMaterial({
    color: srgb(THREE, 0xbfe6f7), roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.55, envMapIntensity: 1.4,
  });
  const bubbleGeo = new THREE.SphereGeometry(1, 32, 24);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bubbles = Array.from({ length: 22 }, () => {
    const mesh = new THREE.Mesh(bubbleGeo, bubbleMat);
    const r = 0.06 + rnd() * 0.22;
    mesh.scale.setScalar(r);
    scene.add(mesh);
    return { mesh, page: rnd() * 3.6, x: rnd() * 2 - 1, z: -3 + rnd() * 6, speed: 0.6 + rnd() * 0.9, phase: rnd() * 6 };
  });

  const slots = {
    molar: root.querySelector('[data-slot="molar"]'),
    brush: root.querySelector('[data-slot="brush"]'),
    arch: root.querySelector('[data-slot="arch"]'),
    steps: root.querySelector('[data-slot-progress="steps"]'),
  };

  let W = 1, H = 1, visH = 1, visW = 1;
  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    visW = visH * camera.aspect;
  }
  resize();

  /** Converte il rettangolo di un elemento in posizione e scala nel mondo 3D. */
  function place(el, parallax = 0.85) {
    const r = el.getBoundingClientRect();
    const cy = (r.top + r.height / 2 - H / 2) / H;    // -0.5 … 0.5 quando è sullo schermo
    const cx = (r.left + r.width / 2) / W - 0.5;
    return {
      x: cx * visW,
      y: -cy * visH * parallax,
      size: (Math.min(r.height / H * visH, r.width / W * visW)),
      t: clamp(cy, -1.5, 1.5),                          // posizione relativa: negativa sopra il centro
      visible: r.bottom > -H * 0.6 && r.top < H * 1.6,
    };
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const spin = { molar: 0, brush: 0, arch: 0 };
  let running = false, raf = 0, drewLast = true;
  const t0 = performance.now();

  function frame(now) {
    const time = reducedMotion ? 0 : (now - t0) / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    const ease = reducedMotion ? 1 : 0.12;
    let any = false;

    // Dente: ruota mentre la pagina scende.
    if (slots.molar) {
      const s = place(slots.molar, 0.75);
      molarPivot.visible = molarShadow.visible = s.visible;
      if (s.visible) {
        any = true;
        const k = s.size / 2.8;
        spin.molar += (s.t * 2.6 - spin.molar) * ease;
        molarPivot.position.set(s.x, s.y + Math.sin(time * 1.1) * 0.06 * k, 0);
        molarPivot.scale.setScalar(k);
        molarPivot.rotation.set(0.22 + pointer.y * 0.15 + spin.molar * 0.15, -0.6 + spin.molar + Math.sin(time * 0.5) * 0.25 + pointer.x * 0.35, 0.05);
        molarShadow.position.set(s.x, s.y - 1.45 * k, -0.6);
        molarShadow.scale.setScalar(k);
      }
    }

    // Spazzolino: accompagna i tre passi cambiando angolazione.
    if (slots.brush) {
      const s = place(slots.brush, 1);
      brushPivot.visible = s.visible;
      if (s.visible) {
        any = true;
        let p = 0;
        if (slots.steps) {
          const r = slots.steps.getBoundingClientRect();
          p = clamp((H * 0.5 - r.top) / Math.max(1, r.height), 0, 1);
        }
        spin.brush += (p - spin.brush) * ease;
        const k = s.size / (W < 700 ? 3.1 : 3.9);
        brushPivot.position.set(s.x, s.y + Math.sin(time * 0.9) * 0.05, 0);
        brushPivot.scale.setScalar(k);
        brushPivot.rotation.set(
          0.35 - spin.brush * 0.5 + pointer.y * 0.1,
          -0.5 + spin.brush * Math.PI * 1.15 + pointer.x * 0.2,
          0.9 - spin.brush * 0.5 + Math.sin(time * 0.7) * 0.05,
        );
      }
    }

    // Arcata: si inclina verso chi guarda mentre arriva al centro dello schermo.
    if (slots.arch) {
      const s = place(slots.arch, 0.8);
      archPivot.visible = s.visible;
      if (s.visible) {
        any = true;
        spin.arch += (s.t - spin.arch) * ease;
        const k = s.size / 3.7;
        archPivot.position.set(s.x, s.y, 0);
        archPivot.scale.setScalar(k);
        archPivot.rotation.set(0.75 + spin.arch * 0.9 + pointer.y * 0.1, spin.arch * -1.2 + Math.sin(time * 0.4) * 0.2 + pointer.x * 0.3, 0);
      }
    }

    // Bollicine legate alla pagina: ognuna scorre alla sua velocità.
    const page = scrollY / H;
    bubbles.forEach((b) => {
      const y = (b.page - page) * visH * b.speed + Math.sin(time * 0.6 + b.phase) * 0.15;
      b.mesh.visible = Math.abs(y) < visH;
      b.mesh.position.set(b.x * visW * 0.55, y, b.z);
    });
    any = any || page < 3.6;

    // Si disegna anche il primo fotogramma senza oggetti, così la tela si svuota.
    if (any || drewLast) renderer.render(scene, camera);
    drewLast = any;
    if (running) raf = requestAnimationFrame(frame);
  }

  return {
    start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize,
    setPointer(x, y) { if (!reducedMotion) { pointer.tx = x; pointer.ty = y; } },
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
