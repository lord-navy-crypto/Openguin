#!/usr/bin/env python3
from pathlib import Path
import struct, zlib

SIZE = 128
OUT = Path(__file__).resolve().parents[1] / "src-tauri" / "icons" / "icon.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

# Simple generated placeholder icon: dark rounded-looking square with a light M glyph.
# No external image dependency is required for source builds.
def px(x, y):
    bg = (18, 22, 30, 255)
    fg = (232, 236, 244, 255)
    # transparent outer corners for a softer app-icon silhouette
    cx = min(x, SIZE - 1 - x)
    cy = min(y, SIZE - 1 - y)
    if cx < 12 and cy < 12 and (12-cx)**2 + (12-cy)**2 > 12**2:
        return (0, 0, 0, 0)
    # stylized M
    if 34 <= y <= 91:
        if 31 <= x <= 42 or 85 <= x <= 96:
            return fg
        if 42 <= x <= 63 and abs((x-42) - (y-34)*0.38) < 5:
            return fg
        if 64 <= x <= 85 and abs((85-x) - (y-34)*0.38) < 5:
            return fg
    return bg

raw = bytearray()
for y in range(SIZE):
    raw.append(0)  # PNG filter type 0
    for x in range(SIZE):
        raw.extend(px(x, y))

def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
png += chunk(b"IEND", b"")
OUT.write_bytes(png)
print(f"Prepared Tauri icon: {OUT}")
