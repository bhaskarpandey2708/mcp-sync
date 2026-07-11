#!/usr/bin/env python3
"""
Launch-story slides — beginner-first, big type, safe margins.

Zoom metadata (for build-story-demo.sh):
  zoom: "none" | "in" | "out"
  focus: (fx, fy) in 0..1 — where emphasis lives (NOT always center).
  zoom_max: max scale (keep tiny, e.g. 1.06) so text never gets cropped.

Renders at 2× (3840×2160, 300 DPI).
"""
from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

W, H = 3840, 2160
DPI = 300
FPS = 30
CHARS_PER_SEC = 24

ROOT = Path(__file__).resolve().parent
STORY = ROOT / "story"
FRAMES = STORY / "frames"
SLIDES_STILL = STORY / "slides"
MANIFEST = STORY / "manifest.json"

BG = (12, 12, 20)
FG = (230, 233, 245)
MUTED = (160, 168, 196)
ACCENT = (137, 180, 250)
WARN = (249, 226, 175)
OK = (166, 227, 161)
PINK = (243, 139, 168)
SURFACE = (28, 28, 44)
SURFACE2 = (38, 38, 58)
DIM = (90, 95, 120)
ORANGE = (250, 179, 135)  # Cursor-ish
PURPLE = (203, 166, 247)  # Claude-ish
GREEN = (166, 227, 161)   # Copilot-ish


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
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
    x: int | None = None


@dataclass
class SlideSpec:
    id: str
    hold_after: float
    # Camera: default NONE — only nudge when we have a clear emphasis region
    zoom: str = "none"  # none | in | out
    focus: tuple[float, float] = (0.5, 0.45)  # fx, fy of emphasis (0..1)
    zoom_max: float = 1.05  # never crop text; keep subtle
    kicker: str | None = None
    kicker_color: tuple[int, int, int] = ACCENT
    lines: list[TypeLine] = field(default_factory=list)
    extras: list[Callable] = field(default_factory=list)


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 10], fill=ACCENT)
    return img, d


def draw_kicker(d: ImageDraw.ImageDraw, text: str, color=ACCENT) -> None:
    f = font(26, bold=True)
    d.text((220, 100), text, font=f, fill=color)
    tw = d.textlength(text, font=f)
    d.rectangle([220, 100 + f.size + 14, 220 + tw, 100 + f.size + 22], fill=color)


def draw_cursor(d: ImageDraw.ImageDraw, x: float, y: float, f: ImageFont.ImageFont, on: bool) -> None:
    if not on:
        return
    h = f.size
    d.rectangle([x + 6, y + 6, x + 22, y + h - 6], fill=ACCENT)


def render_typed_slide(spec: SlideSpec) -> dict:
    out_dir = FRAMES / spec.id
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    segments: list[tuple[TypeLine, str]] = [(line, line.text) for line in spec.lines]
    total_chars = sum(len(t) for _, t in segments)
    type_frames = max(1, int(total_chars / CHARS_PER_SEC * FPS)) if total_chars else 1
    hold_frames = int(spec.hold_after * FPS)
    frame_i = 0

    def paint(chars_shown: int, blink: bool) -> Image.Image:
        img, d = canvas()
        if spec.kicker:
            draw_kicker(d, spec.kicker, spec.kicker_color)

        remaining = chars_shown
        last_x, last_y, last_f = W / 2, H / 2, font(40)
        typing = total_chars > 0 and chars_shown < total_chars

        for line_spec, full in segments:
            take = min(remaining, len(full))
            shown = full[:take]
            remaining -= take

            y = line_spec.y
            line_h = int(line_spec.font.size * 1.28)
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
                full_tw = d.textlength(wl, font=line_spec.font)
                if line_spec.x is not None:
                    x = line_spec.x
                elif line_spec.center:
                    x = (W - full_tw) / 2
                else:
                    x = 220
                tw = d.textlength(piece, font=line_spec.font) if piece else 0
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

    for fi in range(type_frames + 1):
        chars = int(total_chars * (fi / max(1, type_frames))) if total_chars else 0
        blink = (fi // 8) % 2 == 0
        img = paint(chars, blink)
        img.save(out_dir / f"f{frame_i:05d}.png", "PNG", dpi=(DPI, DPI))
        frame_i += 1

    final = paint(total_chars, False)
    for _ in range(hold_frames):
        final.save(out_dir / f"f{frame_i:05d}.png", "PNG", dpi=(DPI, DPI))
        frame_i += 1

    SLIDES_STILL.mkdir(parents=True, exist_ok=True)
    final.save(SLIDES_STILL / f"{spec.id}.png", "PNG", dpi=(DPI, DPI))

    return {
        "id": spec.id,
        "frames": frame_i,
        "duration": frame_i / FPS,
        "dir": str(out_dir.relative_to(ROOT)),
        "chars": total_chars,
        "zoom": spec.zoom,
        "focus": list(spec.focus),
        "zoom_max": spec.zoom_max,
    }


# ---------- extras ----------

def extra_open_cta(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    """First-screen punch: command + brand names people recognize."""
    # Command box — the thing they should run
    cmd = "npx mcp-config-sync status"
    f = font(38, bold=True)
    tw = d.textlength(cmd, font=f)
    y = 980
    box = [(W - tw) / 2 - 90, y, (W + tw) / 2 + 90, y + 180]
    d.rounded_rectangle(box, radius=32, fill=SURFACE, outline=OK, width=8)
    d.text(((W - tw) / 2, y + 50), cmd, font=f, fill=OK)

    # Brand attraction row
    brands = [
        ("Claude", PURPLE),
        ("Cursor", ORANGE),
        ("Copilot", GREEN),
        ("VS Code", ACCENT),
        ("Windsurf", MUTED),
    ]
    bf = font(28, bold=True)
    gap = 36
    widths = [d.textlength(n, font=bf) + 100 for n, _ in brands]
    total = sum(widths) + gap * (len(brands) - 1)
    x = (W - total) // 2
    by = 1280
    for (name, color), w in zip(brands, widths):
        d.rounded_rectangle([x, by, x + w, by + 110], radius=24, fill=SURFACE, outline=color, width=5)
        d.ellipse([x + 28, by + 35, x + 58, by + 65], fill=color)
        d.text((x + 76, by + 28), name, font=bf, fill=FG)
        x += w + gap

    tip_f = font(24)
    tip = "Free  ·  open source  ·  safe by default  ·  no install"
    ttw = d.textlength(tip, font=tip_f)
    d.text(((W - ttw) / 2, 1480), tip, font=tip_f, fill=DIM)


def extra_mcp_explainer(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    cards = [
        (ACCENT, "01", "Plugins for AI", "GitHub, files, search,\ndatabases, browsers…"),
        (WARN, "02", "Stored per app", "Each AI app keeps its\nown private list."),
        (PINK, "03", "They drift apart", "Add a tool once — the\nother apps never see it."),
    ]
    card_w, card_h = 1000, 700
    gap = 70
    total = 3 * card_w + 2 * gap
    x0 = (W - total) // 2
    y0 = 1000
    num_f = font(36, bold=True)
    title_f = font(30, bold=True)
    body_f = font(24)
    for i, (color, num, title, body) in enumerate(cards):
        x = x0 + i * (card_w + gap)
        d.rounded_rectangle([x, y0, x + card_w, y0 + card_h], radius=36, fill=SURFACE, outline=color, width=6)
        d.rounded_rectangle([x + 50, y0 + 45, x + 180, y0 + 135], radius=20, fill=SURFACE2, outline=color, width=4)
        tw = d.textlength(num, font=num_f)
        d.text((x + 115 - tw / 2, y0 + 55), num, font=num_f, fill=color)
        d.text((x + 50, y0 + 200), title, font=title_f, fill=FG)
        by = y0 + 340
        for line in body.split("\n"):
            d.text((x + 50, by), line, font=body_f, fill=MUTED)
            by += int(body_f.size * 1.35)


def extra_problem_grid(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    cards = [
        ("Claude Desktop", "Missing GitHub key", "DRIFTED", PINK),
        ("Cursor", "Fully set up (your truth)", "SOURCE", OK),
        ("VS Code", "Only 1 tool installed", "DRIFTED", PINK),
        ("Copilot / Claude Code", "2 tools — incomplete", "DRIFTED", PINK),
    ]
    card_w, card_h = 1480, 360
    gap_x, gap_y = 70, 50
    total_w = 2 * card_w + gap_x
    x0 = (W - total_w) // 2
    y0 = 920
    title_f = font(34, bold=True)
    body_f = font(26)
    badge_f = font(20, bold=True)
    for i, (title, body, badge, border) in enumerate(cards):
        col, row = i % 2, i // 2
        x = x0 + col * (card_w + gap_x)
        y = y0 + row * (card_h + gap_y)
        d.rounded_rectangle([x, y, x + card_w, y + card_h], radius=32, fill=SURFACE, outline=border, width=6)
        d.text((x + 55, y + 50), title, font=title_f, fill=FG)
        d.text((x + 55, y + 160), body, font=body_f, fill=MUTED)
        bw = d.textlength(badge, font=badge_f)
        bx = x + card_w - bw - 90
        by = y + 48
        d.rounded_rectangle([bx - 28, by - 8, bx + bw + 28, by + badge_f.size + 16], radius=18, fill=SURFACE2, outline=border, width=4)
        d.text((bx, by), badge, font=badge_f, fill=border)


def extra_pain_rows(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    rows = [
        ("1", "Fix a tool in Cursor…", "Claude Desktop is still broken."),
        ("2", "Add a new MCP server…", "You re-add it in every other app."),
        ("3", "A week later…", "You forgot which config is truth."),
    ]
    y = 780
    num_f = font(38, bold=True)
    main_f = font(34, bold=True)
    sub_f = font(28)
    for n, main, sub in rows:
        d.ellipse([240, y, 350, y + 110], fill=SURFACE, outline=PINK, width=6)
        tw = d.textlength(n, font=num_f)
        d.text((295 - tw / 2, y + 20), n, font=num_f, fill=PINK)
        d.text((420, y + 8), main, font=main_f, fill=FG)
        d.text((420, y + 90), sub, font=sub_f, fill=MUTED)
        y += 280


def extra_solution_pillars(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    steps = [
        ("01", "See the drift", "status", "Every AI app +\nwhat's different."),
        ("02", "Preview the fix", "sync --dry-run", "Plan only.\nZero writes."),
        ("03", "Apply safely", "sync --from …", "Backups first.\nUndo anytime."),
    ]
    box_w, box_h = 980, 720
    gap = 70
    total = 3 * box_w + 2 * gap
    x0 = (W - total) // 2
    y = 1040
    nf = font(32, bold=True)
    tf = font(30, bold=True)
    cmd_f = font(22, bold=True)
    body_f = font(24)
    for i, (n, title, cmd, body) in enumerate(steps):
        x = x0 + i * (box_w + gap)
        d.rounded_rectangle([x, y, x + box_w, y + box_h], radius=36, fill=SURFACE, outline=ACCENT, width=6)
        d.text((x + 55, y + 45), n, font=nf, fill=ACCENT)
        d.text((x + 55, y + 140), title, font=tf, fill=FG)
        cw = d.textlength(cmd, font=cmd_f)
        d.rounded_rectangle([x + 55, y + 270, x + 95 + cw, y + 270 + cmd_f.size + 36], radius=18, fill=SURFACE2, outline=OK, width=4)
        d.text((x + 75, y + 288), cmd, font=cmd_f, fill=OK)
        by = y + 420
        for line in body.split("\n"):
            d.text((x + 55, by), line, font=body_f, fill=MUTED)
            by += int(body_f.size * 1.4)


def extra_safety_badges(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    badges = [
        (OK, "Safe by default"),
        (ACCENT, "Auto backups"),
        (WARN, "Dry-run first"),
        (MUTED, "Free & open source"),
    ]
    f = font(26, bold=True)
    y = 1180
    gap = 36
    widths = [d.textlength(text, font=f) + 130 for _, text in badges]
    total = sum(widths) + gap * (len(badges) - 1)
    x = (W - total) // 2
    for (color, text), w in zip(badges, widths):
        d.rounded_rectangle([x, y, x + w, y + 110], radius=26, fill=SURFACE, outline=color, width=5)
        d.ellipse([x + 32, y + 36, x + 72, y + 76], fill=color)
        d.text((x + 92, y + 28), text, font=f, fill=FG)
        x += w + gap


def extra_end_cta(d: ImageDraw.ImageDraw, img: Image.Image) -> None:
    cmd = "npx mcp-config-sync status"
    f = font(40, bold=True)
    tw = d.textlength(cmd, font=f)
    y = 820
    box = [(W - tw) / 2 - 100, y, (W + tw) / 2 + 100, y + 190]
    d.rounded_rectangle(box, radius=36, fill=SURFACE, outline=OK, width=8)
    d.text(((W - tw) / 2, y + 50), cmd, font=f, fill=OK)

    sub_f = font(28, bold=True)
    sub = "github.com/bhaskarpandey2708/mcp-sync"
    stw = d.textlength(sub, font=sub_f)
    d.text(((W - stw) / 2, int(box[3]) + 70), sub, font=sub_f, fill=ACCENT)

    tip_f = font(24)
    tip = "Claude  ·  Cursor  ·  Copilot  ·  VS Code  ·  Windsurf"
    ttw = d.textlength(tip, font=tip_f)
    d.text(((W - ttw) / 2, int(box[3]) + 180), tip, font=tip_f, fill=MUTED)


def build_specs() -> list[SlideSpec]:
    """
    Story for ads / Reddit:
      1) HARD CTA first (name + try now + brand magnets)
      2) Educate noobs
      3) Problem / pain
      4) Product + safety
      5) Live terminal (no camera thrash)
      6) Close CTA
    Zoom is rare, subtle, and focused on the emphasis region only.
    """
    return [
        # ── 1. FIRST SCREEN: CTA + name + brand magnets ──
        SlideSpec(
            id="01-open-cta",
            hold_after=3.6,
            zoom="none",  # full frame — never crop the CTA
            lines=[
                TypeLine("mcp-sync", font(72, bold=True), ACCENT, 320),
                TypeLine("Try it in 10 seconds", font(48, bold=True), FG, 560),
                TypeLine("Keep Claude, Cursor, Copilot & VS Code tools in sync.", font(28), MUTED, 760),
            ],
            extras=[extra_open_cta],
        ),
        # ── 2. Hook (why care) — gentle push on headline only ──
        SlideSpec(
            id="02-hook",
            hold_after=2.4,
            zoom="in",
            focus=(0.5, 0.42),  # headline sits upper-mid
            zoom_max=1.06,
            lines=[
                TypeLine("Your AI apps don't share tools.", font(56, bold=True), FG, 780),
                TypeLine("And that's quietly breaking your setup.", font(32), MUTED, 1080),
            ],
        ),
        # ── 3. Educate: what is MCP ──
        SlideSpec(
            id="03-what-is-mcp",
            hold_after=3.4,
            zoom="none",  # cards need full frame
            kicker="QUICK CONTEXT",
            kicker_color=ACCENT,
            lines=[
                TypeLine("MCP = tools your AI can use.", font(48, bold=True), FG, 360),
                TypeLine("Think plugins: GitHub, files, search, databases.", font(28), MUTED, 600),
            ],
            extras=[extra_mcp_explainer],
        ),
        # ── 4. Problem grid ──
        SlideSpec(
            id="04-problem",
            hold_after=3.6,
            zoom="none",
            kicker="THE PROBLEM",
            kicker_color=WARN,
            lines=[
                TypeLine("Same you. Four AI apps. Four tool lists.", font(42, bold=True), FG, 340),
                TypeLine("None of them match.", font(30), MUTED, 580),
            ],
            extras=[extra_problem_grid],
        ),
        # ── 5. Pain ──
        SlideSpec(
            id="05-pain",
            hold_after=3.2,
            zoom="in",
            focus=(0.5, 0.55),  # numbered list center-mass
            zoom_max=1.05,
            kicker="WHAT THAT FEELS LIKE",
            kicker_color=PINK,
            lines=[
                TypeLine("It's not an AI bug — it's config chaos.", font(38, bold=True), FG, 360),
            ],
            extras=[extra_pain_rows],
        ),
        # ── 6. Solution ──
        SlideSpec(
            id="06-solution",
            hold_after=3.4,
            zoom="in",
            focus=(0.5, 0.28),  # product name at top
            zoom_max=1.05,
            kicker="THE FIX",
            kicker_color=OK,
            lines=[
                TypeLine("One source of truth for your AI tools.", font(40, bold=True), FG, 340),
                TypeLine("Pick your best app → copy that setup to the rest.", font(28), MUTED, 580),
            ],
            extras=[extra_solution_pillars],
        ),
        # ── 7. Safety ──
        SlideSpec(
            id="07-safety",
            hold_after=2.4,
            zoom="none",
            kicker="FOR THE CAUTIOUS",
            kicker_color=OK,
            lines=[
                TypeLine("Nothing scary. Nothing permanent.", font(44, bold=True), FG, 520),
                TypeLine("Preview first. Backups always. Undo anytime.", font(30), MUTED, 780),
            ],
            extras=[extra_safety_badges],
        ),
        # ── 8. Demo intro ──
        SlideSpec(
            id="08-demo-intro",
            hold_after=2.2,
            zoom="none",
            lines=[
                TypeLine("Watch a live fix.", font(52, bold=True), FG, 700),
                TypeLine("Source of truth: Cursor", font(32, bold=True), OK, 1000),
                TypeLine("See drift  →  preview  →  apply  →  confirm", font(28), MUTED, 1200),
            ],
        ),
        # Step captions — static (paired with terminal, no extra motion)
        SlideSpec(
            id="09-cap-status",
            hold_after=2.0,
            zoom="none",
            kicker="STEP 1 OF 4",
            kicker_color=WARN,
            lines=[
                TypeLine("See what's out of sync", font(48, bold=True), FG, 720),
                TypeLine("mcp-sync status", font(34, bold=True), WARN, 1060),
            ],
        ),
        SlideSpec(
            id="10-cap-dryrun",
            hold_after=2.0,
            zoom="none",
            kicker="STEP 2 OF 4",
            kicker_color=ACCENT,
            lines=[
                TypeLine("Preview before you write anything", font(44, bold=True), FG, 720),
                TypeLine("mcp-sync sync --from cursor --dry-run", font(30, bold=True), ACCENT, 1060),
            ],
        ),
        SlideSpec(
            id="11-cap-sync",
            hold_after=2.0,
            zoom="none",
            kicker="STEP 3 OF 4",
            kicker_color=OK,
            lines=[
                TypeLine("Make every app match Cursor", font(44, bold=True), FG, 720),
                TypeLine("mcp-sync sync --from cursor", font(34, bold=True), OK, 1060),
            ],
        ),
        SlideSpec(
            id="12-cap-done",
            hold_after=1.8,
            zoom="none",
            kicker="STEP 4 OF 4",
            kicker_color=OK,
            lines=[
                TypeLine("All clear.", font(56, bold=True), FG, 720),
                TypeLine("Same tools. Every app. One command.", font(30), MUTED, 1020),
            ],
        ),
        # ── Close CTA ──
        SlideSpec(
            id="99-cta",
            hold_after=3.5,
            zoom="none",
            lines=[
                TypeLine("Your turn.", font(52, bold=True), FG, 420),
                TypeLine("10 seconds. No install.", font(32), MUTED, 640),
            ],
            extras=[extra_end_cta],
        ),
    ]


def main() -> None:
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)
    SLIDES_STILL.mkdir(parents=True, exist_ok=True)

    entries = []
    for spec in build_specs():
        print(
            f"animating {spec.id}  zoom={spec.zoom} focus={spec.focus} max={spec.zoom_max}",
            flush=True,
        )
        entries.append(render_typed_slide(spec))

    MANIFEST.write_text(
        json.dumps(
            {"fps": FPS, "width": W, "height": H, "dpi": DPI, "slides": entries},
            indent=2,
        )
    )
    print("wrote", MANIFEST)


if __name__ == "__main__":
    main()
