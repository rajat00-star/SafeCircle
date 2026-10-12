"""Render the synthetic DEMO screenshot used in the Forensics demo.

The message is invented by the SafeCircle team (reserved .example domain, no real
numbers). Usage: python scripts/make_demo_screenshot.py [output.png]
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "frontend/public/demo/scam-sms-demo.png"

LINES = [
    ("header", "VK-SBIUPD  ·  Text message"),
    ("bubble", "Dear SBI customer, your KYC is pending."),
    ("bubble", "Your account will be blocked today."),
    ("bubble", "Update now: http://sbi-kyc-update.example/kyc/login"),
    ("bubble", "Share the OTP sent to your phone with our"),
    ("bubble", "officer to stop the block."),
    ("footer", "DEMO DATA - synthetic screenshot for SafeCircle"),
]


def font(size: int) -> ImageFont.ImageFont:
    for path in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def main() -> None:
    w, h = 900, 560
    img = Image.new("RGB", (w, h), (245, 246, 250))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 70], fill=(30, 33, 45))
    d.text((32, 22), LINES[0][1], font=font(26), fill=(240, 240, 245))
    d.rounded_rectangle([28, 100, w - 60, 400], radius=26, fill=(255, 255, 255), outline=(220, 222, 230), width=2)
    y = 124
    for kind, text in LINES[1:-1]:
        d.text((56, y), text, font=font(30), fill=(20, 22, 30))
        y += 54
    d.text((32, h - 60), LINES[-1][1], font=font(22), fill=(150, 60, 60))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, format="PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
