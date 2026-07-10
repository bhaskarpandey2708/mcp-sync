#!/bin/sh
# Build the full narrative 1080p launch video:
#   problem → solution → live demo → try it
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STORY="$ROOT/demo/story"
mkdir -p "$STORY"

echo "==> 1. Story slides"
python3 demo/make_story_slides.py

echo "==> 2. Ensure CLI built"
if [ ! -f dist/cli.js ]; then
  echo "dist/cli.js missing — run npm run build first" >&2
  exit 1
fi

echo "==> 3. Terminal segments (VHS)"
vhs demo/demo-story.tape
vhs demo/demo-story-dry.tape
vhs demo/demo-story-sync.tape
vhs demo/demo-story-done.tape

zoom_term() {
  # Crop empty bottom + scale so text fills 1080p
  in="$1"
  out="$2"
  ffmpeg -y -i "$in" \
    -vf "crop=1920:780:0:30,scale=1920:1080:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset veryfast -crf 16 -an \
    "$out" </dev/null
}

echo "==> 4. Zoom terminal clips for readability"
zoom_term "$STORY/term-status.mp4" "$STORY/term-status-z.mp4"
zoom_term "$STORY/term-dryrun.mp4" "$STORY/term-dryrun-z.mp4"
zoom_term "$STORY/term-sync.mp4" "$STORY/term-sync-z.mp4"
zoom_term "$STORY/term-done.mp4" "$STORY/term-done-z.mp4"

slide_clip() {
  png="$1"
  secs="$2"
  out="$3"
  ffmpeg -y -loop 1 -i "$png" -t "$secs" \
    -vf "scale=1920:1080:flags=lanczos,format=yuv420p,fps=30" \
    -c:v libx264 -preset veryfast -crf 16 -an \
    "$out" </dev/null
}

echo "==> 5. Slide clips"
slide_clip "$STORY/slides/01-title.png" 4.5 "$STORY/s01.mp4"
slide_clip "$STORY/slides/02-problem.png" 6.5 "$STORY/s02.mp4"
slide_clip "$STORY/slides/03-pain.png" 5.5 "$STORY/s03.mp4"
slide_clip "$STORY/slides/04-solution.png" 5.5 "$STORY/s04.mp4"
slide_clip "$STORY/slides/05-demo-intro.png" 3.5 "$STORY/s05.mp4"
slide_clip "$STORY/slides/06-cap-status.png" 3.0 "$STORY/s06.mp4"
slide_clip "$STORY/slides/07-cap-dryrun.png" 3.0 "$STORY/s07.mp4"
slide_clip "$STORY/slides/08-cap-sync.png" 3.0 "$STORY/s08.mp4"
slide_clip "$STORY/slides/09-cap-done.png" 2.8 "$STORY/s09.mp4"
slide_clip "$STORY/slides/99-cta.png" 5.5 "$STORY/s99.mp4"

echo "==> 6. Concatenate story"
LIST="$STORY/concat.txt"
cat > "$LIST" <<EOF
file 's01.mp4'
file 's02.mp4'
file 's03.mp4'
file 's04.mp4'
file 's05.mp4'
file 's06.mp4'
file 'term-status-z.mp4'
file 's07.mp4'
file 'term-dryrun-z.mp4'
file 's08.mp4'
file 'term-sync-z.mp4'
file 's09.mp4'
file 'term-done-z.mp4'
file 's99.mp4'
EOF

RAW="$STORY/story-raw.mp4"
ffmpeg -y -f concat -safe 0 -i "$LIST" -c copy "$RAW" </dev/null

echo "==> 7. Final high-quality encode"
FINAL="$ROOT/demo/demo-story-1080p.mp4"
ffmpeg -y -i "$RAW" \
  -vf "scale=1920:1080:flags=lanczos,format=yuv420p,fps=30" \
  -c:v libx264 -preset slow -crf 16 -profile:v high -level 4.2 \
  -movflags +faststart -an \
  "$FINAL" </dev/null

# Preview GIF for README embeds
ffmpeg -y -i "$FINAL" \
  -vf "fps=10,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" \
  "$ROOT/demo/demo-story-preview.gif" </dev/null

echo
echo "DONE:"
ls -lh "$FINAL" "$ROOT/demo/demo-story-preview.gif"
ffprobe -v error -show_entries stream=width,height -show_entries format=duration,size \
  -of default=noprint_wrappers=1 "$FINAL"
echo
echo "Post this file:"
echo "  $FINAL"
