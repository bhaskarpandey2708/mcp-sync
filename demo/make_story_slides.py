#!/usr/bin/env python3
"""
High-DPI story slides with typewriter animation frames.

Renders at 2× (3840×2160, 300 DPI) so the final 1080p/1440p downscale stays crisp.
Each slide becomes a sequence of PNG frames (typing effect) under demo/story/frames/<id>/.
"""
from __future__ import annotations

import json
import math
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# 2× 1080p master — downscaled later for razor-sharp text
W, H = 3840, 2160
DPI = 300
FPS = 30
CHARS_PER_SEC = 28  # typing speed

ROOT = Path(__file__).resolve().parent
STORY = ROOT / "story"
FRAMES = STORY / "frames"
SLIDES_STILL = STORY / "slides"  # final still of each slide (for reference)
MANIFEST = STORY / "manifest.json"

BG = (17, 17, 27)
FG = (205, 214, 244)
MUTED = (166, 173, 200)
ACCENT = (137, 180, 250)
WARN = (249, 226, 175)
OK = (166, 227, 161)
PINK = (243, 139, 168)
SURFACE = (30, 30, 46)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    # size is for 1080p-feel; we draw at 2× so double it
    size = int(size * 2)
    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


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
    return lines or [""]


@dataclass
class TypeLine:
    text: str
    font: ImageFont.ImageFont
    fill: tuple[int, int, int]
    y: int
    center: bool = True
    max_w: int = 3200


@dataclass
class SlideSpec:
    id: str
    hold_after: float  # seconds to hold after typing finishes
    kicker: str | None = None
    kicker_color: tuple[int, int, int] = ACCENT
    lines: list[TypeLine] = field(default_factory=list)
    extras: list = field(default_factory=list)  # static drawers after type


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG)
    return img, ImageDraw.Draw(img)


def draw_kicker(d: ImageDraw.ImageDraw, text: str, color=ACCENT) -> None:
    f = font(18, bold=True)
    d.text((240, 160), text, font=f, fill=color)


def draw_line(
    d: ImageDraw.ImageDraw,
    text: str,
    y: int,
    f: ImageFont.ImageFont,
    fill,
    center: bool = True,
    max_w: int = 3200,
) -> int:
    lines = wrap(d, text, f, max_w)
    line_h = int(f.size * 1.35)
    for i, line in enumerate(lines):
        tw = d.textlength(line, font=f)
        x = (W - tw) / 2 if center else 240
        d.text((x, y + i * line_h), line, font=f, fill=fill)
    return y + len(lines) * line_h


def draw_pill(d: ImageDraw.ImageDraw, text: str, y: int, color=ACCENT) -> int:
    f = font(20, bold=True)
    tw = d.textlength(text, font=f)
    pad_x, pad_y = 56, 28
    box = [(W - tw) / 2 - pad_x, y, (W + tw) / 2 + pad_x, y + f.size + pad_y * 2]
    d.rounded_rectangle(box, radius=40, fill=SURFACE, outline=color, width=5)
    d.text(((W - tw) / 2, y + pad_y), text, font=f, fill=color)
    return int(box[3]) + 40


def draw_cursor(d: ImageDraw.ImageDraw, x: float, y: float, f: ImageFont.ImageFont, on: bool) -> None:
    if not on:
        return
    h = f.size
    d.rectangle([x + 4, y + 4, x + 14, y + h - 4], fill=ACCENT)


def visible_prefix(full: str, n: int) -> str:
    return full[: max(0, min(n, len(full)))]


def render_typed_slide(spec: SlideSpec) -> dict:
    """Render typing frames for one slide. Returns manifest entry."""
    out_dir = FRAMES / spec.id
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    # Flatten all characters across lines for sequential typing
    segments: list[tuple[TypeLine, str]] = []
    for line in spec.lines:
        segments.append((line, line.text))

    total_chars = sum(len(t) for _, t in segments)
    # frames while typing
    type_frames = max(1, int(total_chars / CHARS_PER_SEC * FPS))
    hold_frames = int(spec.hold_after * FPS)

    frame_i = 0

    def paint(chars_shown: int, blink: bool) -> Image.Image:
        img, d = canvas()
        if spec.kicker:
            draw_kicker(d, spec.kicker, spec.kicker_color)

        remaining = chars_shown
        last_x, last_y, last_f = W / 2, H / 2, font(28)
        typing = chars_shown < total_chars

        for line_spec, full in segments:
            take = min(remaining, len(full))
            shown = full[:take]
            remaining -= take

            y = line_spec.y
            line_h = int(line_spec.font.size * 1.35)
            # Wrap the full string for stable layout, paint only the shown prefix
            full_lines = wrap(d, full, line_spec.font, line_spec.max_w)
            budget = len(shown)
            for wi, wl in enumerate(full_lines):
                if budget <= 0:
                    piece = ""
                elif budget >= len(wl):
                    piece = wl
                    budget -= len(wl)
                else:
                    piece = wl[:budget]
                    budget = 0
                if not piece and wi > 0 and budget == 0 and take < len(full):
                    break
                tw = d.textlength(piece, font=line_spec.font) if piece else 0
                x = (W - d.textlength(wl, font=line_spec.font)) / 2 if line_spec.center else 240
                if piece:
                    d.text((x, y), piece, font=line_spec.font, fill=line_spec.fill)
                    last_x = x + tw
                    last_y = y
                    last_f = line_spec.font
                y += line_h
                if take < len(full) and budget == 0:
                    break

            if take < len(full):
                break

        if chars_shown >= total_chars:
            for extra in spec.extras:
                extra(d, img)

        if typing:
            draw_cursor(d, last_x, last_y, last_f, blink)
        return img

    # Typing phase
    for fi in range(type_frames + 1):
        chars = int(total_chars * (fi / max(1, type_frames)))
        blink = (fi // 8) % 2 == 0
        img = paint(chars, blink)
        path = out_dir / f"f{frame_i:05d}.png"
        img.save(path, "PNG", dpi=(DPI, DPI))
        frame_i += 1

    # Hold phase (final frame)
    final = paint(total_chars, False)
    for _ in range(hold_frames):
        path = out_dir / f"f{frame_i:05d}.png"
        final.save(path, "PNG", dpi=(DPI, DPI))
        frame_i += 1

    # Also save a still for reference
    SLIDES_STILL.mkdir(parents=True, exist_ok=True)
    still = SLIDES_STILL / f"{spec.id}.png"
    final.save(still, "PNG", dpi=(DPI, DPI))

    return {
        "id": spec.id,
        "frames": frame_i,
        "duration": frame_i / FPS,
        "dir": str(out_dir.relative_to(ROOT)),
        "chars": total_chars,
    }


# ---------- extras (static drawings once typing done) ----------

def extra_problem_cards(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    cards = [
        ("Claude Desktop", "Has GitHub… missing a key", PINK),
        ("Cursor", "Fully set up (your real workspace)", OK),
        ("VS Code", "Only one tool installed", PINK),
        ("Claude Code", "Two tools — already drifted", PINK),
    ]
    card_w, card_h = 800, 420
    gap = 48
    total = 4 * card_w + 3 * gap
    x0 = (W - total) // 2
    y0 = 980
    title_f = font(18, bold=True)
    body_f = font(15)
    for i, (title, body, border) in enumerate(cards):
        x = x0 + i * (card_w + gap)
        d.rounded_rectangle([x, y0, x + card_w, y0 + card_h], radius=32, fill=SURFACE, outline=border, width=5)
        d.text((x + 48, y0 + 60), title, font=title_f, fill=FG)
        by = y0 + 160
        for line in wrap(d, body, body_f, card_w - 96):
            d.text((x + 48, by), line, font=body_f, fill=MUTED)
            by += int(body_f.size * 1.35)


def extra_pain_bullets(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    bullets = [
        "Fix something in Cursor… Claude Desktop is still wrong.",
        "Add a new tool… re-add it in every other app.",
        "Lose track of which config has the real settings.",
    ]
    f = font(24)
    y = 700
    for b in bullets:
        d.ellipse([320, y + 20, 360, y + 60], fill=PINK)
        d.text((420, y), b, font=f, fill=FG)
        y += 160


def extra_solution_steps(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    steps = [
        ("1", "See the drift", "status"),
        ("2", "Preview the fix", "sync --dry-run"),
        ("3", "Apply safely", "sync (with backups)"),
    ]
    box_w, box_h = 960, 400
    gap = 60
    total = 3 * box_w + 2 * gap
    x0 = (W - total) // 2
    y = 1100
    nf = font(28, bold=True)
    tf = font(22, bold=True)
    sf = font(16)
    for i, (n, title, sub) in enumerate(steps):
        x = x0 + i * (box_w + gap)
        d.rounded_rectangle([x, y, x + box_w, y + box_h], radius=32, fill=SURFACE, outline=ACCENT, width=5)
        d.text((x + 60, y + 50), n, font=nf, fill=ACCENT)
        d.text((x + 60, y + 170), title, font=tf, fill=FG)
        d.text((x + 60, y + 270), sub, font=sf, fill=MUTED)


def extra_cta_box(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    cmd = "npx mcp-config-sync status"
    f = font(28, bold=True)
    tw = d.textlength(cmd, font=f)
    y = 900
    box = [(W - tw) / 2 - 80, y, (W + tw) / 2 + 80, y + 160]
    d.rounded_rectangle(box, radius=28, fill=SURFACE, outline=OK, width=5)
    d.text(((W - tw) / 2, y + 50), cmd, font=f, fill=OK)
    draw_line(d, "Free  ·  open source  ·  safe by default", int(box[3]) + 80, font(20), MUTED)
    draw_line(d, "github.com/bhaskarpandey2708/mcp-sync", int(box[3]) + 180, font(18), ACCENT)


def build_specs() -> list[SlideSpec]:
    return [
        SlideSpec(
            id="01-title",
            hold_after=2.2,
            lines=[
                TypeLine("You use AI in more than one app.", font(36, bold=True), FG, 700),
                TypeLine("But each app keeps its own copy of your tools.", font(26), MUTED, 1000),
                TypeLine("That's a problem.", font(22, bold=True), WARN, 1300),
            ],
        ),
        SlideSpec(
            id="02-problem",
            hold_after=3.5,
            kicker="THE PROBLEM",
            kicker_color=WARN,
            lines=[
                TypeLine("You set up the same tools over and over.", font(32, bold=True), FG, 420),
                TypeLine(
                    "A week later, nothing matches. You don't know which app is right.",
                    font(22),
                    MUTED,
                    1600,
                ),
            ],
            extras=[extra_problem_cards],
        ),
        SlideSpec(
            id="03-pain",
            hold_after=2.8,
            kicker="WHAT THAT FEELS LIKE",
            kicker_color=WARN,
            lines=[
                TypeLine("It's not a bug in AI — it's config chaos.", font(28, bold=True), ACCENT, 1500),
            ],
            extras=[extra_pain_bullets],
        ),
        SlideSpec(
            id="04-solution",
            hold_after=3.2,
            kicker="THE SOLUTION",
            kicker_color=OK,
            lines=[
                TypeLine("mcp-sync", font(56, bold=True), ACCENT, 480),
                TypeLine("One command to keep every AI app's tools in sync.", font(24), FG, 780),
            ],
            extras=[extra_solution_steps],
        ),
        SlideSpec(
            id="05-demo-intro",
            hold_after=2.0,
            lines=[
                TypeLine("Watch it work", font(40, bold=True), FG, 700),
                TypeLine("We'll pick Cursor as the source of truth,", font(24), MUTED, 1000),
                TypeLine("then make every other app match it.", font(24), MUTED, 1180),
                TypeLine("Live demo  ·  about 30 seconds", font(20, bold=True), OK, 1500),
            ],
        ),
        SlideSpec(
            id="06-cap-status",
            hold_after=1.8,
            kicker="STEP 1  ·  SEE THE PROBLEM",
            kicker_color=WARN,
            lines=[
                TypeLine("Are my apps out of sync?", font(36, bold=True), FG, 800),
                TypeLine("One command shows which tools differ.", font(24), MUTED, 1100),
            ],
        ),
        SlideSpec(
            id="07-cap-dryrun",
            hold_after=1.8,
            kicker="STEP 2  ·  PREVIEW THE FIX",
            kicker_color=ACCENT,
            lines=[
                TypeLine("What would change?", font(36, bold=True), FG, 800),
                TypeLine("Dry-run shows the plan. Nothing is written yet.", font(24), MUTED, 1100),
            ],
        ),
        SlideSpec(
            id="08-cap-sync",
            hold_after=1.8,
            kicker="STEP 3  ·  APPLY SAFELY",
            kicker_color=OK,
            lines=[
                TypeLine("Make every app match Cursor", font(36, bold=True), FG, 800),
                TypeLine("Files are backed up first. You can always undo.", font(24), MUTED, 1100),
            ],
        ),
        SlideSpec(
            id="09-cap-done",
            hold_after=1.6,
            kicker="STEP 4  ·  CONFIRM",
            kicker_color=OK,
            lines=[
                TypeLine("All clear.", font(40, bold=True), FG, 800),
                TypeLine("Every app now has the same tools.", font(24), MUTED, 1100),
            ],
        ),
        SlideSpec(
            id="99-cta",
            hold_after=3.5,
            lines=[
                TypeLine("Try it yourself", font(40, bold=True), FG, 520),
            ],
            extras=[extra_cta_box],
        ),
    ]


def main() -> None:
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)
    SLIDES_STILL.mkdir(parents=True, exist_ok=True)

    entries = []
    for spec in build_specs():
        print(f"animating {spec.id} …", flush=True)
        entries.append(render_typed_slide(spec))

    MANIFEST.write_text(json.dumps({"fps": FPS, "width": W, "height": H, "dpi": DPI, "slides": entries}, indent=2))
    print("wrote", MANIFEST)
    print("still slides in", SLIDES_STILL)
    print("frames in", FRAMES)


if __name__ == "__main__":
    main()
