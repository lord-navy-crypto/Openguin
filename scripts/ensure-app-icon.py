#!/usr/bin/env python3
from pathlib import Path
import struct, zlib, subprocess, shutil, sys

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "src-tauri" / "icons"
PUBLIC = ROOT / "public"
ICONS.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)

SIZE = 1024
BASE = ICONS / "icon.png"

def ellipse(x, y, cx, cy, rx, ry):
    return ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1

def triangle(x, y, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0]-p3[0])*(p2[1]-p3[1]) - (p2[0]-p3[0])*(p1[1]-p3[1])
    p=(x,y)
    d1,d2,d3=sign(p,a,b),sign(p,b,c),sign(p,c,a)
    return not ((d1<0 or d2<0 or d3<0) and (d1>0 or d2>0 or d3>0))

def sample(px, py):
    # Geometry authored in a 256x256 coordinate system and scaled to 1024.
    x, y = px / 4.0, py / 4.0
    transparent=(0,0,0,0); black=(12,12,14,255); white=(250,250,250,255)
    body = ellipse(x,y,128,139,72,92) or ellipse(x,y,128,78,66,58)
    left_flipper = ellipse(x,y,62,148,22,65) and x < 76
    right_flipper = ellipse(x,y,194,148,22,65) and x > 180
    feet = ellipse(x,y,101,224,31,12) or ellipse(x,y,155,224,31,12)
    if not (body or left_flipper or right_flipper or feet): return transparent
    color=black
    if ellipse(x,y,104,82,36,39) or ellipse(x,y,152,82,36,39) or ellipse(x,y,128,155,48,64): color=white
    if ellipse(x,y,105,78,7,10) or ellipse(x,y,151,78,7,10): color=black
    if ellipse(x,y,103,75,2,3) or ellipse(x,y,149,75,2,3): color=white
    if triangle(x,y,(114,101),(142,101),(128,115)): color=black
    if triangle(x,y,(119,25),(130,5),(132,31)) or triangle(x,y,(131,26),(148,12),(143,36)): color=black
    return color

def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)

raw=bytearray()
for y in range(SIZE):
    raw.append(0)
    for x in range(SIZE): raw.extend(sample(x,y))
png=b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR",struct.pack(">IIBBBBB",SIZE,SIZE,8,6,0,0,0)) + chunk(b"IDAT",zlib.compress(bytes(raw),9)) + chunk(b"IEND",b"")
BASE.write_bytes(png)

# Browser/dev favicon: SVG uses the same original Openguin geometry and remains crisp.
svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Openguin penguin">
<g fill="#0c0c0e">
<ellipse cx="128" cy="139" rx="72" ry="92"/><ellipse cx="128" cy="78" rx="66" ry="58"/>
<ellipse cx="62" cy="148" rx="22" ry="65"/><ellipse cx="194" cy="148" rx="22" ry="65"/>
<ellipse cx="101" cy="224" rx="31" ry="12"/><ellipse cx="155" cy="224" rx="31" ry="12"/>
<path d="M119 25 130 5 132 31ZM131 26 148 12 143 36Z"/>
</g>
<g fill="#fafafa"><ellipse cx="104" cy="82" rx="36" ry="39"/><ellipse cx="152" cy="82" rx="36" ry="39"/><ellipse cx="128" cy="155" rx="48" ry="64"/></g>
<g fill="#0c0c0e"><ellipse cx="105" cy="78" rx="7" ry="10"/><ellipse cx="151" cy="78" rx="7" ry="10"/><path d="M114 101h28l-14 14Z"/></g>
<g fill="#fafafa"><ellipse cx="103" cy="75" rx="2" ry="3"/><ellipse cx="149" cy="75" rx="2" ry="3"/></g>
</svg>'''
(PUBLIC / "openguin.svg").write_text(svg)

# Tauri/macOS iconset. On macOS use built-in sips + iconutil, so no Pillow dependency is needed.
if sys.platform == "darwin" and shutil.which("sips") and shutil.which("iconutil"):
    iconset = ICONS / "Openguin.iconset"
    if iconset.exists(): shutil.rmtree(iconset)
    iconset.mkdir()
    entries=[(16,"icon_16x16.png"),(32,"icon_16x16@2x.png"),(32,"icon_32x32.png"),(64,"icon_32x32@2x.png"),(128,"icon_128x128.png"),(256,"icon_128x128@2x.png"),(256,"icon_256x256.png"),(512,"icon_256x256@2x.png"),(512,"icon_512x512.png"),(1024,"icon_512x512@2x.png")]
    for size,name in entries:
        subprocess.run(["sips","-z",str(size),str(size),str(BASE),"--out",str(iconset/name)],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(["iconutil","-c","icns",str(iconset),"-o",str(ICONS/"icon.icns")],check=True)
    # Common desktop PNG sizes expected by Tauri.
    for size,name in [(32,"32x32.png"),(128,"128x128.png"),(256,"128x128@2x.png")]:
        subprocess.run(["sips","-z",str(size),str(size),str(BASE),"--out",str(ICONS/name)],check=True,stdout=subprocess.DEVNULL)
    shutil.rmtree(iconset)
    print("Prepared Openguin icon.png + icon.icns + desktop PNG icon set.")
else:
    print("Prepared Openguin 1024px icon.png + SVG favicon; macOS icon.icns will be generated on a Mac build machine.")
