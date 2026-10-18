"""Marchio Smile Up in SVG: dente stilizzato con sorriso, scia con freccia verso l'alto e scintille.

    python3 tools/logo.py   -> stampa il marchio e scrive public/assets/favicon.svg
"""
from pathlib import Path

TOOTH = ("M38 22c-11 0-18 9-18 22 0 11 4.5 19.5 7 28.5 2.3 10 4.5 21 11 21 6.5 0 6.5-12 11-20 "
         "2-4.5 4.5-6.5 11-6.5s9 2 11 6.5c4.5 8 4.5 20 11 20 6.5 0 8.7-11 11-21 2.5-9 7-17.5 7-28.5 "
         "0-13-7-22-18-22-9 0-13.5 4.5-24 4.5S47 22 38 22z")
SPARK = "M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10z"


def mark(uid, dark=False):
    """Marchio a colori. `dark` schiarisce il blu per lo sfondo scuro."""
    blue = "#8FD0EC" if dark else "#004493"
    return f'''<svg class="logo-mark" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="{uid}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{blue}"/><stop offset="1" stop-color="#1AA3D2"/></linearGradient>
    <linearGradient id="{uid}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DCF1FA" stop-opacity=".9"/><stop offset=".6" stop-color="#DCF1FA" stop-opacity="0"/></linearGradient>
    <linearGradient id="{uid}w" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7CCBEC"/><stop offset="1" stop-color="#1AA3D2"/></linearGradient>
  </defs>
  <path d="{TOOTH}" fill="url(#{uid}f)" stroke="url(#{uid}s)" stroke-width="6.5" stroke-linejoin="round"/>
  <path d="M45 52q15 15 30 0" fill="none" stroke="#1AA3D2" stroke-width="6.5" stroke-linecap="round"/>
  <path d="M33 70C13 86 42 99 72 88c17-6 29-20 36-38" fill="none" stroke="url(#{uid}w)" stroke-width="6" stroke-linecap="round"/>
  <path d="M99 51l9-4 2 10" fill="none" stroke="#1AA3D2" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="{SPARK}" transform="translate(101 16) scale(.9)" fill="#4DB8E2"/>
  <path d="{SPARK}" transform="translate(112 31) scale(.45)" fill="#7CCBEC"/>
</svg>'''


def favicon():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#004493"/><stop offset="1" stop-color="#1AA3D2"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="url(#g)"/><g transform="translate(6 8) scale(.9)"><path d="{TOOTH}" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M45 52q15 15 30 0" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="{SPARK}" transform="translate(103 14) scale(.9)" fill="#BFE6F7"/></g></svg>
'''


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "public" / "assets" / "favicon.svg"
    out.write_text(favicon())
    print(mark("lg"))
