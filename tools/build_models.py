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

def molar_crown(x, y, z):
    body = ellipsoid(x, y, z, (0, 0.32, 0), (0.64, 0.46, 0.55))
    cusps = None
    for sx in (-1, 1):
        for sz in (-1, 1):
            c = sphere(x, y, z, (0.27 * sx, 0.56, 0.22 * sz), 0.29)
            cusps = c if cusps is None else smin(cusps, c, 0.07)
    crown = smin(body, cusps, 0.2)
    # Fossa centrale leggermente scavata
    crown = smax(crown, -sphere(x, y, z, (0, 1.02, 0), 0.24), 0.12)
    # Solchi occlusali a croce fra le cuspidi
    groove_x = round_cone(x, y, z, (-0.42, 0.86, 0.0), (0.42, 0.86, 0.0), 0.05, 0.05)
    groove_z = round_cone(x, y, z, (0.0, 0.86, -0.36), (0.0, 0.86, 0.36), 0.045, 0.045)
    crown = smax(crown, -smin(groove_x, groove_z, 0.04), 0.035)
    return crown


def molar(x, y, z):
    crown = molar_crown(x, y, z)
    # Colletto corto: le radici si separano subito sotto la corona.
    neck = round_cone(x, y, z, (0, 0.18, 0), (0, -0.08, 0), 0.5, 0.44)
    d = smin(crown, neck, 0.16)
    roots = [
        bent_root(x, y, z, [(-0.24, 0.0, 0.12), (-0.36, -0.7, 0.16), (-0.33, -1.42, 0.1)], [0.27, 0.18, 0.075]),
        bent_root(x, y, z, [(0.24, 0.0, 0.12), (0.35, -0.7, 0.16), (0.3, -1.38, 0.12)], [0.26, 0.17, 0.075]),
        bent_root(x, y, z, [(0.0, 0.0, -0.2), (0.03, -0.65, -0.36), (0.07, -1.3, -0.46)], [0.28, 0.18, 0.085]),
    ]
    for r in roots:
        d = smin(d, r, 0.14)
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


if __name__ == "__main__":
    build("molar", molar, (-0.85, -1.62, -0.8), (0.85, 1.08, 0.8), 0.022)
    build("crown-molar", crown_molar, (-0.75, -0.1, -0.7), (0.75, 1.0, 0.7), 0.03)
    build("crown-premolar", crown_premolar, (-0.55, -0.1, -0.6), (0.55, 0.95, 0.6), 0.03)
    build("crown-canine", crown_canine, (-0.5, -0.1, -0.5), (0.5, 0.95, 0.5), 0.03)
    build("crown-incisor", crown_incisor, (-0.55, -0.1, -0.3), (0.55, 0.95, 0.3), 0.025)
    build("brush-handle", brush_handle, (-0.15, -0.3, -0.25), (3.55, 0.3, 0.3), 0.0125, smooth_iter=4)
    build("brush-grip", brush_grip, (1.45, -0.22, 0.0), (2.4, 0.22, 0.22), 0.012, smooth_iter=4)
