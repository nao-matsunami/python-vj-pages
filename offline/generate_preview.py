from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw


def render_frame(path: Path, frame: int, total: int, size: tuple[int, int] = (1280, 720)) -> None:
    phase = (frame / total) * math.tau
    width, height = size
    image = Image.new("RGB", size, (2, 3, 3))
    draw = ImageDraw.Draw(image, "RGBA")
    cx, cy = width / 2, height / 2
    min_side = min(size)
    for i in range(96):
        t = i / 96
        angle = phase + t * math.tau
        radius = min_side * (0.12 + 0.36 * ((i * 13) % 97) / 97)
        x = cx + math.cos(angle) * radius
        y = cy + math.sin(angle * 0.86) * radius * 0.72
        color = (158, 230, 111, 70) if i % 2 == 0 else (51, 217, 184, 70)
        draw.ellipse((x - 16, y - 16, x + 16, y + 16), fill=color)
    image.save(path)


if __name__ == "__main__":
    out_dir = Path("renders/preview_frames")
    out_dir.mkdir(parents=True, exist_ok=True)
    for frame_index in range(120):
        render_frame(out_dir / f"frame_{frame_index:04d}.png", frame_index, 120)
