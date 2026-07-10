#!/usr/bin/env python3
"""Render 1920x1080 storyboard slides for the launch demo (sharp text via PIL)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
OUT = Path(__file__).resolve().parent / "story" / "slides"
BG = (17, 17, 27)  # near Catppuccin base
FG = (205, 214, 244)
MUTED = (166, 173, 200)
ACCENT = (137, 180, 250)  # blue
WARN = (249, 226, 175)  # yellow
OK = (166, 227, 161)  # green
PINK = (243, 139, 168)
SURFACE = (30, 30, 46)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def new_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG)
    return img, ImageDraw.Draw(img)


def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.ImageFont, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=f) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def draw_centered(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    f: ImageFont.ImageFont,
    fill=FG,
    max_w: int = 1600,
) -> int:
    lines = wrap(draw, text, f, max_w)
    line_h = int(f.size * 1.35)
    for i, line in enumerate(lines):
        tw = draw.textlength(line, font=f)
        draw.text(((W - tw) / 2, y + i * line_h), line, font=f, fill=fill)
    return y + len(lines) * line_h


def pill(draw: ImageDraw.ImageDraw, text: str, y: int, fill=ACCENT) -> int:
    f = font(36, bold=True)
    tw = draw.textlength(text, font=f)
    pad_x, pad_y = 28, 14
    box = [
        (W - tw) / 2 - pad_x,
        y,
        (W + tw) / 2 + pad_x,
        y + f.size + pad_y * 2,
    ]
    draw.rounded_rectangle(box, radius=20, fill=SURFACE, outline=fill, width=3)
    draw.text(((W - tw) / 2, y + pad_y), text, font=f, fill=fill)
    return int(box[3]) + 30


def save(img: Image.Image, name: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    img.save(path, "PNG")
    print("wrote", path)
    return path


def slide_title() -> None:
    img, d = new_canvas()
    y = 280
    y = draw_centered(d, "You use AI in more than one app.", y, font(64, bold=True))
    y += 40
    y = draw_centered(d, "But each app keeps its own copy of your tools.", y + 20, font(48), MUTED)
    y += 80
    pill(d, "That's a problem.", y, WARN)
    save(img, "01-title.png")


def slide_problem() -> None:
    img, d = new_canvas()
    d.text((120, 80), "THE PROBLEM", font=font(32, bold=True), fill=WARN)
    y = 160
    y = draw_centered(d, "You set up the same tools over and over.", y, font(56, bold=True), max_w=1700)
    y += 50

    cards = [
        ("Claude Desktop", "Has GitHub… missing a key"),
        ("Cursor", "Fully set up (your real workspace)"),
        ("VS Code", "Only one tool installed"),
        ("Claude Code", "Two tools — already drifted"),
    ]
    card_w, card_h = 400, 220
    gap = 30
    total = 4 * card_w + 3 * gap
    x0 = (W - total) // 2
    y0 = y + 20
    for i, (title, body) in enumerate(cards):
        x = x0 + i * (card_w + gap)
        d.rounded_rectangle([x, y0, x + card_w, y0 + card_h], radius=18, fill=SURFACE, outline=PINK if i != 1 else OK, width=3)
        d.text((x + 24, y0 + 30), title, font=font(28, bold=True), fill=FG)
        for j, line in enumerate(wrap(d, body, font(24), card_w - 48)):
            d.text((x + 24, y0 + 90 + j * 34), line, font=font(24), fill=MUTED)

    y = y0 + card_h + 70
    draw_centered(d, "A week later, nothing matches. You don't know which app is right.", y, font(36), MUTED, max_w=1700)
    save(img, "02-problem.png")


def slide_pain() -> None:
    img, d = new_canvas()
    d.text((120, 80), "WHAT THAT FEELS LIKE", font=font(32, bold=True), fill=WARN)
    y = 220
    bullets = [
        "Fix something in Cursor… Claude Desktop is still wrong.",
        "Add a new tool… re-add it in every other app.",
        "Lose track of which config has the real settings.",
    ]
    for b in bullets:
        d.ellipse([160, y + 12, 184, y + 36], fill=PINK)
        d.text((220, y), b, font=font(42), fill=FG)
        y += 110
    y += 40
    draw_centered(d, "It's not a bug in AI — it's config chaos.", y, font(40, bold=True), ACCENT)
    save(img, "03-pain.png")


def slide_solution() -> None:
    img, d = new_canvas()
    d.text((120, 80), "THE SOLUTION", font=font(32, bold=True), fill=OK)
    y = 200
    y = draw_centered(d, "mcp-sync", y, font(96, bold=True), ACCENT)
    y += 30
    y = draw_centered(d, "One command to keep every AI app's tools in sync.", y + 10, font(44), FG, max_w=1700)
    y += 80

    steps = [
        ("1", "See the drift", "status"),
        ("2", "Preview the fix", "sync --dry-run"),
        ("3", "Apply safely", "sync (with backups)"),
    ]
    box_w = 480
    gap = 40
    total = 3 * box_w + 2 * gap
    x0 = (W - total) // 2
    for i, (n, title, sub) in enumerate(steps):
        x = x0 + i * (box_w + gap)
        d.rounded_rectangle([x, y, x + box_w, y + 200], radius=18, fill=SURFACE, outline=ACCENT, width=3)
        d.text((x + 30, y + 30), n, font=font(48, bold=True), fill=ACCENT)
        d.text((x + 30, y + 95), title, font=font(36, bold=True), fill=FG)
        d.text((x + 30, y + 145), sub, font=font(26), fill=MUTED)
    save(img, "04-solution.png")


def slide_demo_intro() -> None:
    img, d = new_canvas()
    y = 320
    y = draw_centered(d, "Watch it work", y, font(72, bold=True))
    y += 40
    y = draw_centered(d, "We'll pick Cursor as the source of truth,", y + 20, font(40), MUTED)
    y = draw_centered(d, "then make every other app match it.", y + 20, font(40), MUTED)
    y += 80
    pill(d, "Live demo  ·  30 seconds", y + 20, OK)
    save(img, "05-demo-intro.png")


def slide_caption(name: str, kicker: str, title: str, subtitle: str, color=ACCENT) -> None:
    img, d = new_canvas()
    d.text((120, 120), kicker, font=font(32, bold=True), fill=color)
    y = 280
    y = draw_centered(d, title, y, font(64, bold=True), FG, max_w=1700)
    y += 40
    draw_centered(d, subtitle, y + 20, font(40), MUTED, max_w=1700)
    save(img, name)


def slide_cta() -> None:
    img, d = new_canvas()
    y = 200
    y = draw_centered(d, "Try it yourself", y, font(64, bold=True))
    y += 60
    # Command box
    cmd = "npx mcp-config-sync status"
    f = font(48, bold=True)
    tw = d.textlength(cmd, font=f)
    box = [(W - tw) / 2 - 48, y, (W + tw) / 2 + 48, y + 100]
    d.rounded_rectangle(box, radius=16, fill=SURFACE, outline=OK, width=3)
    d.text(((W - tw) / 2, y + 28), cmd, font=f, fill=OK)
    y = int(box[3]) + 70
    y = draw_centered(d, "Free  ·  open source  ·  safe by default", y, font(36), MUTED)
    y += 50
    draw_centered(d, "github.com/bhaskarpandey2708/mcp-sync", y + 20, font(32), ACCENT)
    save(img, "99-cta.png")


def main() -> None:
    slide_title()
    slide_problem()
    slide_pain()
    slide_solution()
    slide_demo_intro()
    slide_caption(
        "06-cap-status.png",
        "STEP 1  ·  SEE THE PROBLEM",
        "Are my apps out of sync?",
        "One command shows which tools differ.",
        WARN,
    )
    slide_caption(
        "07-cap-dryrun.png",
        "STEP 2  ·  PREVIEW THE FIX",
        "What would change?",
        "Dry-run shows the plan. Nothing is written yet.",
        ACCENT,
    )
    slide_caption(
        "08-cap-sync.png",
        "STEP 3  ·  APPLY SAFELY",
        "Make every app match Cursor",
        "Files are backed up first. You can always undo.",
        OK,
    )
    slide_caption(
        "09-cap-done.png",
        "STEP 4  ·  CONFIRM",
        "All clear.",
        "Every app now has the same tools.",
        OK,
    )
    slide_cta()
    print("All slides in", OUT)


if __name__ == "__main__":
    main()
