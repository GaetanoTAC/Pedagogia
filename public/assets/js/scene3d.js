// Mondo 3D della home in stile "ologramma": oggetti disegnati con linee luminose
// azzurre, una pedana a griglia sotto ciascuno e il riflesso. La tela è fissa dietro
// la pagina; ogni oggetto segue un "posto" (data-slot) e scorre con il testo,
// un po' più lentamente, ruotando mentre passa. Usa three.js r128.

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

// ---------- materiali olografici ----------

const HOLO_VERT = /* glsl */`
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vWorldY;
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vLocal = local.xyz;
    vec4 world = modelMatrix * local;
    vWorldY = world.y;
    vec4 mv = viewMatrix * world;
    vView = normalize(-mv.xyz);
    vNormal = normalize(normalMatrix * n);
    gl_Position = projectionMatrix * mv;
  }`;

const HOLO_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform float uOpacity;
  uniform float uDensity;
  uniform float uMeridians;
  uniform float uAxisX;
  uniform float uTime;
  uniform float uReflect;
  uniform float uFloor;
  uniform float uFadeLen;
  uniform float uGumLevel;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vWorldY;

  float gridLine(float v) {
    float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4);
    return 1.0 - min(d, 1.0);
  }

  void main() {
    // Anelli lungo l'asse principale e meridiani attorno ad esso.
    float along = mix(vLocal.y, vLocal.x, uAxisX);
    vec2 around = mix(vLocal.xz, vLocal.zy, uAxisX);
    float ring = gridLine(along * uDensity);
    float merid = gridLine(atan(around.y, around.x) / 6.2831853 * uMeridians);
    float line = max(ring, merid * 0.85);

    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float fres = pow(1.0 - facing, 2.0);
    float scan = 0.5 + 0.5 * sin(vWorldY * 5.0 - uTime * 1.6);

    vec3 fill = vec3(0.90, 0.97, 1.0);
    vec3 col = mix(fill, uColor, clamp(line * 1.2, 0.0, 1.0));
    col = mix(col, uEdge, clamp(fres * 1.15, 0.0, 1.0));
    float a = (0.16 + line * 0.42 + fres * 0.55) * (0.92 + 0.08 * scan);
    // Gengive (sotto il colletto) più tenui e azzurre, per distinguerle dai denti.
    float gum = smoothstep(uGumLevel + 0.04, uGumLevel - 0.04, vLocal.y);
    col = mix(col, vec3(0.55, 0.80, 0.94), gum * 0.55);
    a *= mix(1.0, 0.7, gum);
    if (uReflect > 0.5) a *= smoothstep(uFloor - uFadeLen, uFloor, vWorldY) * 0.3;
    gl_FragColor = vec4(col, clamp(a * uOpacity, 0.0, 1.0));
  }`;

function holoMaterial(THREE, { color = 0x1aa3d2, edge = 0x0a5bb5, density = 24, meridians = 48, axisX = false, opacity = 1, xray = true, gumLevel = -99 } = {}) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uEdge: { value: new THREE.Color(edge) },
      uOpacity: { value: opacity },
      uDensity: { value: density },
      uMeridians: { value: meridians },
      uAxisX: { value: axisX ? 1 : 0 },
      uTime: { value: 0 },
      uReflect: { value: 0 },
      uFloor: { value: 0 },
      uFadeLen: { value: 1 },
      uGumLevel: { value: gumLevel },
    },
    transparent: true,
    depthWrite: !xray,
    side: xray ? THREE.DoubleSide : THREE.FrontSide,
  });
  mat.extensions = { derivatives: true };
  return mat;
}

const GRID_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 g = vUv * 18.0;
    vec2 d = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
    float line = 1.0 - min(min(d.x, d.y), 1.0);
    vec2 c = vUv - 0.5;
    float fade = smoothstep(0.5, 0.12, max(abs(c.x), abs(c.y)) * 0.6 + length(c) * 0.55);
    float a = (line * 0.5 + 0.05) * fade * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }`;

function gridMaterial(THREE) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: GRID_FRAG,
    uniforms: { uColor: { value: new THREE.Color(0x1aa3d2) }, uOpacity: { value: 0.8 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  mat.extensions = { derivatives: true };
  return mat;
}

/** Copia un oggetto sostituendo i materiali con la versione "riflesso" (sfuma verso il basso). */
function reflectionOf(object) {
  const clone = object.clone(true);
  clone.traverse((o) => {
    if (o.material?.uniforms) {
      o.material = o.material.clone();
      o.material.extensions = { derivatives: true };
      o.material.uniforms.uReflect.value = 1;
    }
  });
  return clone;
}

/**
 * Oggetto in esposizione: l'oggetto, la pedana a griglia sotto di lui e il riflesso.
 * `floor` è la quota della pedana nello spazio dell'oggetto.
 */
function exhibit(THREE, object, { floor, gridSize = 3.6 }) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(object);
  const mirrorPivot = new THREE.Group();
  mirrorPivot.add(reflectionOf(object));
  const mirror = new THREE.Group();
  mirror.add(mirrorPivot);
  mirror.scale.y = -1;
  mirror.position.y = 2 * floor;
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(gridSize, gridSize), gridMaterial(THREE));
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = floor;
  root.add(grid, mirror, pivot);
  const mats = [];
  root.traverse((o) => { if (o.material?.uniforms?.uTime) mats.push(o.material); });
  return {
    root, pivot, floor,
    setRotation(x, y, z) { pivot.rotation.set(x, y, z); mirrorPivot.rotation.set(x, y, z); },
    setLift(v) { pivot.position.y = v; mirrorPivot.position.y = v; },
    update(time) {
      const worldFloor = new THREE.Vector3(0, floor, 0).applyMatrix4(root.matrixWorld).y;
      const fadeLen = 1.4 * root.scale.y;
      mats.forEach((m) => {
        m.uniforms.uTime.value = time;
        m.uniforms.uFloor.value = worldFloor;
        m.uniforms.uFadeLen.value = fadeLen;
      });
    },
    get children() { return [pivot, mirrorPivot]; },
  };
}

// ---------- oggetti ----------

function centerGeometry(geo) {
  const b = geo.boundingBox;
  geo.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
  geo.computeBoundingBox();
  return geo;
}

function makeBrush(THREE, handleGeo, gripGeo) {
  const inner = new THREE.Group();
  inner.add(new THREE.Mesh(handleGeo, holoMaterial(THREE, { density: 20, meridians: 22, axisX: true })));
  inner.add(new THREE.Mesh(gripGeo, holoMaterial(THREE, { color: 0x4db8e2, density: 34, meridians: 22, axisX: true, opacity: 0.9 })));

  // Ciuffi di setole disposti sull'ovale della testina.
  const profile = [];
  const R = 0.021, H = 0.27;
  profile.push(new THREE.Vector2(0, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, H - R));
  for (let k = 1; k <= 5; k++) {
    const a = (k / 5) * (Math.PI / 2);
    profile.push(new THREE.Vector2(Math.cos(a) * R, H - R + Math.sin(a) * R));
  }
  const tuftGeo = new THREE.LatheGeometry(profile, 8);
  tuftGeo.rotateX(Math.PI / 2);
  const spots = [];
  for (let x = 2.87; x <= 3.34; x += 0.052) {
    for (let y = -0.15; y <= 0.15; y += 0.052) {
      const ex = (x - 3.1) / 0.27, ey = y / 0.155;
      if (ex * ex + ey * ey <= 1) spots.push([x, y]);
    }
  }
  const tufts = new THREE.InstancedMesh(tuftGeo, holoMaterial(THREE, { color: 0x4db8e2, density: 60, meridians: 6, opacity: 0.7 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, y], k) => { m.makeTranslation(x, y, 0.1); tufts.setMatrixAt(k, m); });
  inner.add(tufts);
  inner.position.set(-1.7, 0, -0.05);
  const group = new THREE.Group();
  group.add(inner);
  return group;
}

/**
 * Bocca: arcata inferiore (gengiva e corone fuse in un solo modello) e arcata superiore
 * ottenuta specchiandola in verticale, così incisivi e molari restano allineati.
 */
function makeMouth(THREE, archGeo) {
  const b = archGeo.boundingBox;
  archGeo.translate(-(b.min.x + b.max.x) / 2, 0, -(b.min.z + b.max.z) / 2);
  const mat = holoMaterial(THREE, { density: 30, meridians: 90, opacity: 0.95, xray: false, gumLevel: -0.02 });
  const lower = new THREE.Mesh(archGeo, mat);
  const upper = new THREE.Mesh(archGeo, mat);
  upper.scale.set(1.04, -1, 1.04);
  const hinge = new THREE.Group();
  hinge.name = 'hinge';                  // cerniera sul retro dell'arcata: si apre come una bocca
  hinge.position.set(0, 0.62, b.min.z - (b.min.z + b.max.z) / 2);
  upper.position.set(0, 0, -hinge.position.z);
  hinge.add(upper);
  const mouth = new THREE.Group();
  mouth.add(lower, hinge);
  return { group: mouth, hinge };
}

/** Puntini luminosi a profondità diverse: scorrono a velocità diverse e danno il senso del movimento. */
function makeDust(THREE, count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const data = Array.from({ length: count }, (_, i) => {
    size[i] = 2 + rnd() * 5;
    return { page: rnd() * 4, x: rnd() * 2 - 1, z: -6 + rnd() * 8, speed: 0.45 + rnd() * 0.9, phase: rnd() * 6 };
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: `attribute float size; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (8.0 / -mv.z) * ${(Math.min(devicePixelRatio || 1, 2)).toFixed(1)}; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * 0.4; gl_FragColor = vec4(0.1, 0.64, 0.82, a); }',
    transparent: true, depthWrite: false,
  });
  return { points: new THREE.Points(geo, mat), data, pos };
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
  renderer.setClearColor(0x000000, 0);

  const [molarGeo, handleGeo, gripGeo, archGeo] = await Promise.all(
    ['molar', 'brush-handle', 'brush-grip', 'arch'].map((n) => loadModel(THREE, n)),
  );

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.6, 12);
  camera.lookAt(0, 0, 0);

  centerGeometry(molarGeo);
  const molar = exhibit(THREE, new THREE.Mesh(molarGeo, holoMaterial(THREE, { density: 26, meridians: 64 })), { floor: -1.5, gridSize: 3.4 });
  const brush = exhibit(THREE, makeBrush(THREE, handleGeo, gripGeo), { floor: -1.75, gridSize: 4.4 });
  const mouth = makeMouth(THREE, archGeo);
  const mouthEx = exhibit(THREE, mouth.group, { floor: -1.0, gridSize: 5.4 });
  const hinges = [];                       // la cerniera dell'arcata e quella del suo riflesso
  mouthEx.root.traverse((o) => { if (o.name === 'hinge') hinges.push(o); });
  scene.add(molar.root, brush.root, mouthEx.root);

  const dust = makeDust(THREE, 140);
  scene.add(dust.points);

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
    const cy = (r.top + r.height / 2 - H / 2) / H;
    const cx = (r.left + r.width / 2) / W - 0.5;
    return {
      x: cx * visW,
      y: -cy * visH * parallax,
      size: Math.min((r.height / H) * visH, (r.width / W) * visW),
      t: clamp(cy, -1.5, 1.5),
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

    if (slots.molar) {
      const s = place(slots.molar, 0.75);
      molar.root.visible = s.visible;
      if (s.visible) {
        any = true;
        spin.molar += (s.t * 2.4 - spin.molar) * ease;
        molar.root.position.set(s.x, s.y + 0.15, 0);
        molar.root.scale.setScalar(s.size / 3.4);
        molar.setLift(Math.sin(time * 1.1) * 0.08);
        molar.setRotation(0.12 + pointer.y * 0.12, -0.5 + spin.molar + Math.sin(time * 0.45) * 0.3 + pointer.x * 0.35, 0);
      }
    }

    if (slots.brush) {
      const s = place(slots.brush, 1);
      brush.root.visible = s.visible;
      if (s.visible) {
        any = true;
        let p = 0;
        if (slots.steps) {
          const r = slots.steps.getBoundingClientRect();
          p = clamp((H * 0.5 - r.top) / Math.max(1, r.height), 0, 1);
        }
        spin.brush += (p - spin.brush) * ease;
        brush.root.position.set(s.x, s.y + 0.2, 0);
        brush.root.scale.setScalar(s.size / (W < 700 ? 3.6 : 4.4));
        brush.setLift(Math.sin(time * 0.9) * 0.06);
        brush.setRotation(
          0.3 - spin.brush * 0.45 + pointer.y * 0.1,
          -0.5 + spin.brush * Math.PI * 1.15 + pointer.x * 0.2,
          0.95 - spin.brush * 0.55 + Math.sin(time * 0.7) * 0.04,
        );
      }
    }

    if (slots.arch) {
      const s = place(slots.arch, 0.8);
      mouthEx.root.visible = s.visible;
      if (s.visible) {
        any = true;
        spin.arch += (s.t - spin.arch) * ease;
        const open = clamp(0.35 - spin.arch, 0, 1);   // si apre mentre sale verso il centro
        mouthEx.root.position.set(s.x, s.y - 0.2, 0);
        mouthEx.root.scale.setScalar(s.size / (W < 700 ? 5.2 : 4.6));
        hinges.forEach((h) => { h.rotation.x = -open * 0.7; });
        mouthEx.setRotation(0.38 + open * 0.25 + pointer.y * 0.08, spin.arch * -0.9 + Math.sin(time * 0.35) * 0.18 + pointer.x * 0.25, 0);
      }
    }

    const page = scrollY / H;
    dust.data.forEach((d, i) => {
      const y = (d.page - page) * visH * d.speed + Math.sin(time * 0.5 + d.phase) * 0.12;
      dust.pos[i * 3] = d.x * visW * 0.6;
      dust.pos[i * 3 + 1] = Math.abs(y) < visH ? y : 999;
      dust.pos[i * 3 + 2] = d.z;
    });
    dust.points.geometry.attributes.position.needsUpdate = true;
    any = any || page < 4;

    scene.updateMatrixWorld();
    [molar, brush, mouthEx].forEach((e) => e.update(time));
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
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose());
      });
      renderer.dispose();
    },
  };
}
