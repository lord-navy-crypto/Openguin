#!/usr/bin/env python3
from pathlib import Path
import math, struct, zlib

SIZE = 256
OUT = Path(__file__).resolve().parents[1] / "src-tauri" / "icons" / "icon.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

# Original Openguin monochrome mascot icon generated entirely in code.
# Broadly minimalist black/white software-mascot aesthetics, but no copied logo geometry.
def ellipse(x, y, cx, cy, rx, ry):
    return ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1

def triangle(x, y, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0]-p3[0])*(p2[1]-p3[1]) - (p2[0]-p3[0])*(p1[1]-p3[1])
    p=(x,y)
    d1,d2,d3=sign(p,a,b),sign(p,b,c),sign(p,c,a)
    return not ((d1<0 or d2<0 or d3<0) and (d1>0 or d2>0 or d3>0))

def px(x, y):
    # Transparent canvas lets macOS provide the outer app-icon treatment.
    transparent=(0,0,0,0); black=(12,12,14,255); white=(250,250,250,255)

    # Main penguin silhouette: head + torso + flippers + feet.
    body = ellipse(x,y,128,139,72,92) or ellipse(x,y,128,78,66,58)
    left_flipper = ellipse(x,y,62,148,22,65) and x < 76
    right_flipper = ellipse(x,y,194,148,22,65) and x > 180
    feet = ellipse(x,y,101,224,31,12) or ellipse(x,y,155,224,31,12)
    if body or left_flipper or right_flipper or feet:
        color=black
    else:
        return transparent

    # White face patches and belly create the penguin identity.
    if ellipse(x,y,104,82,36,39) or ellipse(x,y,152,82,36,39) or ellipse(x,y,128,155,48,64):
        color=white

    # Eyes.
    if ellipse(x,y,105,78,7,10) or ellipse(x,y,151,78,7,10):
        color=black
    if ellipse(x,y,103,75,2,3) or ellipse(x,y,149,75,2,3):
        color=white

    # Small geometric beak, intentionally monochrome.
    if triangle(x,y,(114,101),(142,101),(128,115)):
        color=black

    # Tiny head tuft for a distinctive Openguin silhouette.
    if triangle(x,y,(119,25),(130,5),(132,31)) or triangle(x,y,(131,26),(148,12),(143,36)):
        color=black

    return color

raw=bytearray()
for y in range(SIZE):
    raw.append(0)
    for x in range(SIZE):
        raw.extend(px(x,y))

def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)

png=b"\x89PNG\r\n\x1a\n"
png+=chunk(b"IHDR",struct.pack(">IIBBBBB",SIZE,SIZE,8,6,0,0,0))
png+=chunk(b"IDAT",zlib.compress(bytes(raw),9))
png+=chunk(b"IEND",b"")
OUT.write_bytes(png)
print(f"Prepared Openguin penguin icon: {OUT}")
