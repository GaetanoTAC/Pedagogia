"""Genera i modelli 3D della home (dente, arcata, spazzolino) in public/assets/models/.

Ogni oggetto è descritto come superficie implicita (signed distance field) fatta di
forme semplici fuse fra loro, poi trasformata in mesh con marching cubes e levigata.

    pip install numpy scipy scikit-image
    python3 tools/build_models.py

Formato dei file .bin (little endian):
    uint32 numero vertici, uint32 numero indici, float32[3] minimo, float32[3] massimo,
    uint16[3 * vertici] posizioni quantizzate nel box, uint16|uint32[indici] triangoli
"""

from pathlib import Path
import struct

import numpy as np
from scipy.interpolate import PchipInterpolator
from skimage.measure import marching_cubes

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "models"


# ---------- primitive SDF ----------

def length(*c):
    return np.sqrt(sum(x * x for x in c))


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def ellipsoid(x, y, z, c, r):
    px, py, pz = (x - c[0]) / r[0], (y - c[1]) / r[1], (z - c[2]) / r[2]
    k0 = length(px, py, pz)
    k1 = length(px / r[0], py / r[1], pz / r[2])
    return k0 * (k0 - 1) / np.maximum(k1, 1e-6)


def sphere(x, y, z, c, r):
    return length(x - c[0], y - c[1], z - c[2]) - r


def round_cone(x, y, z, a, b, r1, r2):
    """Cono con estremità sferiche fra i punti a e b (formula di Inigo Quilez)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a
    l2 = ba @ ba
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pax, pay, paz = x - a[0], y - a[1], z - a[2]
    yv = pax * ba[0] + pay * ba[1] + paz * ba[2]
    zv = yv - l2
    cx = pax * l2 - ba[0] * yv
    cy = pay * l2 - ba[1] * yv
    cz = paz * l2 - ba[2] * yv
    x2 = cx * cx + cy * cy + cz * cz
    y2 = yv * yv * l2
    z2 = zv * zv * l2
    k = np.sign(rr) * rr * rr * x2
    d = np.where(
        np.sign(zv) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2,
        np.where(np.sign(yv) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1,
                 (np.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1))
    return d


def bent_root(x, y, z, pts, radii, k=0.08):
    d = round_cone(x, y, z, pts[0], pts[1], radii[0], radii[1])
    for i in range(1, len(pts) - 1):
        d = smin(d, round_cone(x, y, z, pts[i], pts[i + 1], radii[i], radii[i + 1]), k)
    return d


# ---------- denti ----------

def superellipsoid(x, y, z, c, r, n=2.6):
    """Forma fra l'ellissoide e la scatola arrotondata (n più alto = più squadrata)."""
    f = (np.abs((x - c[0]) / r[0]) ** n + np.abs((y - c[1]) / r[1]) ** n + np.abs((z - c[2]) / r[2]) ** n) ** (1 / n)
    return (f - 1) * min(r)


def molar_crown(x, y, z):
    body = superellipsoid(x, y, z, (0, 0.42, 0), (0.58, 0.4, 0.52), 2.5)
    cusps = None
    for sx, h in ((-1, 0.0), (1, -0.02)):
        for sz, hz in ((1, 0.02), (-1, -0.02)):      # cuspidi vestibolari un po' più alte
            c = sphere(x, y, z, (0.27 * sx, 0.7 + h + hz, 0.21 * sz), 0.25)
            cusps = c if cusps is None else smin(cusps, c, 0.06)
    crown = smin(body, cusps, 0.14)
    # Solchi occlusali a croce fra le cuspidi
    groove_x = round_cone(x, y, z, (-0.4, 0.88, 0.0), (0.4, 0.88, 0.0), 0.05, 0.05)
    groove_z = round_cone(x, y, z, (0.0, 0.88, -0.34), (0.0, 0.88, 0.34), 0.045, 0.045)
    crown = smax(crown, -smin(groove_x, groove_z, 0.04), 0.035)
    return crown


def flat_root(x, y, z, pts, radii, flat=0.62, k=0.08):
    """Radice schiacciata in senso mesio-distale (stretta in x, larga in z)."""
    return bent_root(x / flat, y, z, [(p[0] / flat, p[1], p[2]) for p in pts], radii, k) * flat


def molar(x, y, z):
    crown = molar_crown(x, y, z)
    # Colletto: restringimento netto sotto la corona, poi un tronco radicolare corto.
    neck = superellipsoid(x, y, z, (0, 0.02, 0), (0.43, 0.2, 0.4), 2.2)
    d = smin(crown, neck, 0.14)
    mesial = flat_root(x, y, z, [(-0.25, -0.05, 0), (-0.3, -0.55, 0), (-0.22, -1.12, 0)], [0.36, 0.3, 0.14], flat=0.7)
    distal = flat_root(x, y, z, [(0.25, -0.05, 0), (0.31, -0.53, 0), (0.25, -1.06, 0)], [0.35, 0.29, 0.14], flat=0.7)
    d = smin(d, mesial, 0.12)
    d = smin(d, distal, 0.12)
    return d


def cut_crown(d, y, at=-0.02):
    """Taglia la corona alla linea della gengiva, con un bordo morbido."""
    return smax(d, at - y, 0.05)


def crown_molar(x, y, z):
    return cut_crown(smin(molar_crown(x, y, z), round_cone(x, y, z, (0, 0.15, 0), (0, -0.25, 0), 0.46, 0.4), 0.16), y)


def crown_premolar(x, y, z):
    body = ellipsoid(x, y, z, (0, 0.28, 0), (0.4, 0.42, 0.47))
    cusps = smin(sphere(x, y, z, (0, 0.52, 0.17), 0.24), sphere(x, y, z, (0, 0.5, -0.17), 0.22), 0.08)
    d = smin(body, cusps, 0.18)
    d = smax(d, -round_cone(x, y, z, (-0.3, 0.74, 0.0), (0.3, 0.74, 0.0), 0.04, 0.04), 0.03)
    d = smin(d, round_cone(x, y, z, (0, 0.1, 0), (0, -0.25, 0), 0.36, 0.32), 0.14)
    return cut_crown(d, y)


def crown_canine(x, y, z):
    body = ellipsoid(x, y, z, (0, 0.25, 0), (0.36, 0.42, 0.38))
    tip = round_cone(x, y, z, (0, 0.2, 0.02), (0, 0.78, 0.06), 0.3, 0.05)
    d = smin(body, tip, 0.18)
    d = smin(d, round_cone(x, y, z, (0, 0.1, 0), (0, -0.25, 0), 0.32, 0.28), 0.14)
    return cut_crown(d, y)


def crown_incisor(x, y, z):
    # Corona a spatola: larga e sottile, che si allarga verso il margine incisale.
    sx = x / (0.78 + 0.32 * np.clip(y, -0.3, 0.8))
    body = ellipsoid(sx, y, z, (0, 0.32, 0), (0.33, 0.55, 0.16))
    edge = smax(body, y - 0.78, 0.08)
    d = smin(edge, round_cone(x, y, z, (0, 0.1, 0), (0, -0.25, 0), 0.24, 0.22), 0.12)
    return cut_crown(d, y)


# ---------- spazzolino ----------

# Profilo lungo l'asse x: semi-larghezza (y) e semi-spessore (z).
BRUSH_X = np.array([0.02, 0.35, 0.9, 1.5, 1.95, 2.3, 2.5, 2.68, 2.82, 3.0, 3.22, 3.4])
BRUSH_W = np.array([0.15, 0.21, 0.18, 0.16, 0.2, 0.15, 0.1, 0.085, 0.14, 0.175, 0.17, 0.11])
BRUSH_T = np.array([0.11, 0.135, 0.125, 0.115, 0.13, 0.11, 0.085, 0.07, 0.07, 0.07, 0.07, 0.065])
BRUSH_ZC = np.array([0.0, 0.0, -0.01, -0.02, -0.01, 0.0, 0.02, 0.04, 0.05, 0.05, 0.05, 0.05])
w_of, t_of, zc_of = (PchipInterpolator(BRUSH_X, v) for v in (BRUSH_W, BRUSH_T, BRUSH_ZC))


def brush_handle(x, y, z):
    xc = np.clip(x, BRUSH_X[0], BRUSH_X[-1])
    w, t, zc = w_of(xc), t_of(xc), zc_of(xc)
    r = length(y / w, (z - zc) / t)
    d_sec = (r - 1) * np.minimum(w, t)
    # Intersezione fra la sezione ellittica e la fascia x0..x1 (negativa all'interno).
    slab = np.maximum(BRUSH_X[0] - x, x - BRUSH_X[-1])
    d = length(np.maximum(d_sec, 0), np.maximum(slab, 0)) + np.minimum(np.maximum(d_sec, slab), 0)
    # Estremità arrotondate
    d = smin(d, ellipsoid(x, y, z, (0.03, 0, 0), (0.1, 0.15, 0.11)), 0.08)
    d = smin(d, ellipsoid(x, y, z, (3.38, 0, 0.05), (0.1, 0.11, 0.065)), 0.06)
    return d


def brush_grip(x, y, z):
    """Inserto morbido a goccia sul davanti del manico, dove appoggia il pollice."""
    big = ellipsoid(x, y, z, (2.08, 0, 0.115), (0.24, 0.15, 0.05))
    small = ellipsoid(x, y, z, (1.72, 0, 0.105), (0.16, 0.08, 0.04))
    return smin(big, small, 0.12)


# ---------- conversione in mesh ----------

def build(name, fn, lo, hi, step, smooth_iter=6):
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    axes = [np.arange(lo[i], hi[i] + step, step) for i in range(3)]
    X, Y, Z = np.meshgrid(*axes, indexing="ij")
    vol = fn(X, Y, Z).astype(np.float32)
    verts, faces, _, _ = marching_cubes(vol, 0.0, spacing=(step, step, step))
    verts += lo
    verts = taubin(verts, faces, smooth_iter)
    write(name, verts, faces)


def taubin(verts, faces, iterations, lam=0.5, mu=-0.53):
    """Levigatura che non restringe la forma (alternanza di passi positivi e negativi)."""
    n = len(verts)
    edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    edges = np.concatenate([edges, edges[:, ::-1]])
    deg = np.bincount(edges[:, 0], minlength=n).astype(np.float64)[:, None]
    v = verts.astype(np.float64)
    for _ in range(iterations):
        for f in (lam, mu):
            acc = np.zeros_like(v)
            np.add.at(acc, edges[:, 0], v[edges[:, 1]])
            v = v + f * (acc / np.maximum(deg, 1) - v)
    return v


def write(name, verts, faces):
    vmin, vmax = verts.min(0), verts.max(0)
    q = np.round((verts - vmin) / (vmax - vmin) * 65535).astype("<u2")
    idx = faces.astype("<u2" if len(verts) < 65536 else "<u4").ravel()
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / f"{name}.bin", "wb") as f:
        f.write(struct.pack("<II", len(verts), len(idx)))
        f.write(struct.pack("<3f", *vmin))
        f.write(struct.pack("<3f", *vmax))
        f.write(q.tobytes())
        f.write(idx.tobytes())
    size = (OUT / f"{name}.bin").stat().st_size
    print(f"{name}: {len(verts)} vertici, {len(faces)} triangoli, {size / 1024:.0f} KB")


# ---------- arcata dentale (gengiva + corone in un unico modello) ----------

ARCH_ORDER = ["molar", "molar", "premolar", "premolar", "canine", "incisor", "incisor"]
ARCH_WIDTHS = [0.6, 0.64, 0.44, 0.45, 0.47, 0.4, 0.5]
CROWN_WIDTH = {"molar": 1.16, "premolar": 0.8, "canine": 0.72, "incisor": 0.62}


def arch_curve(n=2000):
    """Curva a ferro di cavallo (vista dall'alto) lunga quanto i denti da ospitare."""
    teeth = ARCH_ORDER + ARCH_ORDER[::-1]
    widths = ARCH_WIDTHS + ARCH_WIDTHS[::-1]
    total = sum(w * 1.03 for w in widths)
    span = np.radians(100)
    phi = np.linspace(-span, span, n)
    def pts(A, B):
        return np.stack([A * np.sin(phi), B * np.cos(phi) - B * 0.35], 1)
    p = pts(1, 1.15)
    s = total / np.sum(np.linalg.norm(np.diff(p, axis=0), axis=1))
    p = pts(s, 1.15 * s)
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    return p, cum, teeth, widths


def build_arch(step=0.03):
    from scipy.spatial import cKDTree
    curve, cum, teeth, widths = arch_curve()
    lo = np.array([curve[:, 0].min() - 0.6, -0.8, curve[:, 1].min() - 0.6])
    hi = np.array([curve[:, 0].max() + 0.6, 0.85, curve[:, 1].max() + 0.6])
    axes = [np.arange(lo[i], hi[i] + step, step) for i in range(3)]
    X, Y, Z = np.meshgrid(*axes, indexing="ij")

    # Gengiva: sezione ellittica attorno alla curva, con la base piatta.
    tree = cKDTree(curve)
    dist, _ = tree.query(np.stack([X.ravel(), Z.ravel()], 1))
    dist = dist.reshape(X.shape)
    # La gengiva arriva al colletto dei denti: le corone restano tutte visibili.
    gum = (length(dist / 0.38, (Y + 0.46) / 0.44) - 1) * 0.38
    gum = smax(gum, -0.72 - Y, 0.08)
    D = gum

    # Corone: ognuna nel proprio sistema di riferimento (x lungo l'arcata, z verso l'esterno).
    along = 0.0
    centre = curve.mean(0)
    for t, w in zip(teeth, widths):
        u = along + w * 0.515
        along += w * 1.03
        i = np.searchsorted(cum, u)
        c = curve[min(i, len(curve) - 1)]
        tan = curve[min(i + 1, len(curve) - 1)] - curve[max(i - 1, 0)]
        tan /= np.linalg.norm(tan)
        nrm = np.array([tan[1], -tan[0]])
        if np.dot(nrm, c - centre) < 0:
            nrm = -nrm
        sc = w / CROWN_WIDTH[t]
        r = 0.75 * max(1.0, sc)
        mask = (np.abs(X - c[0]) < r) & (np.abs(Z - c[1]) < r) & (Y > -0.3)
        px, pz = X[mask] - c[0], Z[mask] - c[1]
        lx = px * tan[0] + pz * tan[1]
        lz = px * nrm[0] + pz * nrm[1]
        fn = {"molar": crown_molar, "premolar": crown_premolar, "canine": crown_canine, "incisor": crown_incisor}[t]
        crown = fn(lx / sc, (Y[mask] + 0.04) / sc, lz / sc) * sc
        D[mask] = smin(D[mask], crown, 0.05)

    verts, faces, _, _ = marching_cubes(D.astype(np.float32), 0.0, spacing=(step, step, step))
    verts += lo
    verts = taubin(verts, faces, 5)
    write("arch", verts, faces)


if __name__ == "__main__":
    build("molar", molar, (-0.8, -1.35, -0.75), (0.8, 1.05, 0.75), 0.02)
    build("brush-handle", brush_handle, (-0.15, -0.3, -0.25), (3.55, 0.3, 0.3), 0.0125, smooth_iter=4)
    build("brush-grip", brush_grip, (1.45, -0.22, 0.0), (2.4, 0.22, 0.22), 0.012, smooth_iter=4)
    build_arch()
