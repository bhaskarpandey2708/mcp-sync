#!/bin/sh
# Build the full narrative launch video with:
#   - typewriter text on high-DPI slides
#   - soft ambient background audio
#   - light keyclick during typing
#   - crisp 1080p final (from 2× masters)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STORY="$ROOT/demo/story"
AUDIO="$STORY/audio"
mkdir -p "$STORY" "$AUDIO"

if [ "${SKIP_SLIDES:-}" = "1" ] && [ -f "$STORY/manifest.json" ]; then
  echo "==> 1. High-DPI typewriter slides (skipped — using existing frames)"
else
  echo "==> 1. High-DPI typewriter slides"
  python3 demo/make_story_slides.py
fi

echo "==> 2. Ensure CLI built"
if [ ! -f dist/cli.js ]; then
  echo "dist/cli.js missing — run npm run build first" >&2
  exit 1
fi

echo "==> 3. Soft ambient BGM + keyclick (ffmpeg synth — no external deps)"
# Warm low pad (two soft sines) — very quiet, non-distracting
ffmpeg -y -f lavfi -i "sine=frequency=110:sample_rate=44100:duration=120" \
  -f lavfi -i "sine=frequency=164.81:sample_rate=44100:duration=120" \
  -f lavfi -i "sine=frequency=220:sample_rate=44100:duration=120" \
  -filter_complex "\
    [0]volume=0.035[a];\
    [1]volume=0.028[b];\
    [2]volume=0.018[c];\
    [a][b][c]amix=inputs=3:duration=longest,\
    highpass=f=80,lowpass=f=2000,\
    afade=t=in:st=0:d=2.5,\
    volume=0.55\
  " -ac 2 "$AUDIO/bgm.wav" </dev/null

# Soft typewriter tick
ffmpeg -y -f lavfi -i "sine=frequency=1400:sample_rate=44100:duration=0.04" \
  -af "volume=0.12,afade=t=out:st=0.008:d=0.03" -ac 1 "$AUDIO/tick.wav" </dev/null

# Soft "whoosh" for terminal sections (optional accent)
ffmpeg -y -f lavfi -i "anoisesrc=color=pink:amplitude=0.15:sample_rate=44100:duration=0.35" \
  -af "highpass=f=400,lowpass=f=3000,afade=t=in:st=0:d=0.05,afade=t=out:st=0.15:d=0.2,volume=0.08" \
  -ac 1 "$AUDIO/whoosh.wav" </dev/null

frames_to_video() {
  id="$1"
  out="$2"
  dir="$STORY/frames/$id"
  # Build typing video from PNG sequence (2× res)
  ffmpeg -y -framerate 30 -i "$dir/f%05d.png" \
    -vf "scale=1920:1080:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset veryfast -crf 15 -pix_fmt yuv420p -an \
    "$out" </dev/null
}

add_typing_audio() {
  # Overlay soft ticks during the first ~60% of the clip (typing phase)
  in="$1"
  out="$2"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
  # Generate a tick track by looping tick for typing window
  type_win=$(python3 -c "print(max(0.8, float('$dur') * 0.55))")
  ffmpeg -y -stream_loop -1 -i "$AUDIO/tick.wav" -t "$type_win" \
    -af "volume=0.35,apad=whole_dur=$dur" -ac 2 "$AUDIO/ticks_$3.wav" </dev/null 2>/dev/null || \
  ffmpeg -y -i "$AUDIO/tick.wav" -af "aloop=loop=40:size=2000,volume=0.3" -t "$dur" -ac 2 "$AUDIO/ticks_$3.wav" </dev/null

  ffmpeg -y -i "$in" -i "$AUDIO/ticks_$3.wav" \
    -filter_complex "[1]volume=0.25,afade=t=out:st=$(python3 -c "print(max(0.2, float('$type_win')-0.3))"):d=0.3[t];[t]apad=whole_dur=$dur[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k -shortest "$out" </dev/null
}

echo "==> 4. Encode typed slide clips"
for id in 01-title 02-problem 03-pain 04-solution 05-demo-intro \
          06-cap-status 07-cap-dryrun 08-cap-sync 09-cap-done 99-cta; do
  echo "  clip $id"
  frames_to_video "$id" "$STORY/v_${id}.mp4"
  add_typing_audio "$STORY/v_${id}.mp4" "$STORY/a_${id}.mp4" "$id"
done

echo "==> 5. Terminal segments (VHS)"
vhs demo/demo-story.tape
vhs demo/demo-story-dry.tape
vhs demo/demo-story-sync.tape
vhs demo/demo-story-done.tape

zoom_term() {
  in="$1"
  out="$2"
  # Upscale path: crop content, scale to 1080p
  ffmpeg -y -i "$in" \
    -vf "crop=1920:780:0:30,scale=1920:1080:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset veryfast -crf 15 -an \
    "$out" </dev/null
  # add subtle whoosh at start
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")
  ffmpeg -y -i "$out" -i "$AUDIO/whoosh.wav" \
    -filter_complex "[1]volume=0.35,apad=whole_dur=$dur[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k -shortest "${out%.mp4}-a.mp4" </dev/null
  mv "${out%.mp4}-a.mp4" "$out"
}

echo "==> 6. Zoom terminal + light SFX"
zoom_term "$STORY/term-status.mp4" "$STORY/term-status-z.mp4"
zoom_term "$STORY/term-dryrun.mp4" "$STORY/term-dryrun-z.mp4"
zoom_term "$STORY/term-sync.mp4" "$STORY/term-sync-z.mp4"
zoom_term "$STORY/term-done.mp4" "$STORY/term-done-z.mp4"

echo "==> 7. Normalize all clips to same audio/video params"
normalize() {
  in="$1"
  out="$2"
  ffmpeg -y -i "$in" \
    -vf "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p" \
    -c:v libx264 -preset veryfast -crf 15 \
    -c:a aac -ar 44100 -ac 2 -b:a 160k \
    -video_track_timescale 15360 \
    "$out" </dev/null
}

for id in 01-title 02-problem 03-pain 04-solution 05-demo-intro \
          06-cap-status 07-cap-dryrun 08-cap-sync 09-cap-done 99-cta; do
  normalize "$STORY/a_${id}.mp4" "$STORY/n_${id}.mp4"
done
normalize "$STORY/term-status-z.mp4" "$STORY/n_term-status.mp4"
normalize "$STORY/term-dryrun-z.mp4" "$STORY/n_term-dryrun.mp4"
normalize "$STORY/term-sync-z.mp4" "$STORY/n_term-sync.mp4"
normalize "$STORY/term-done-z.mp4" "$STORY/n_term-done.mp4"

echo "==> 8. Concatenate"
LIST="$STORY/concat.txt"
cat > "$LIST" <<EOF
file 'n_01-title.mp4'
file 'n_02-problem.mp4'
file 'n_03-pain.mp4'
file 'n_04-solution.mp4'
file 'n_05-demo-intro.mp4'
file 'n_06-cap-status.mp4'
file 'n_term-status.mp4'
file 'n_07-cap-dryrun.mp4'
file 'n_term-dryrun.mp4'
file 'n_08-cap-sync.mp4'
file 'n_term-sync.mp4'
file 'n_09-cap-done.mp4'
file 'n_term-done.mp4'
file 'n_99-cta.mp4'
EOF

RAW="$STORY/story-raw.mp4"
ffmpeg -y -f concat -safe 0 -i "$LIST" -c copy "$RAW" </dev/null

echo "==> 9. Mix ambient BGM under full video + final encode"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$RAW")
ffmpeg -y -i "$RAW" -stream_loop -1 -i "$AUDIO/bgm.wav" \
  -filter_complex "\
    [1:a]volume=0.14,afade=t=in:st=0:d=2,afade=t=out:st=$(python3 -c "print(max(0, float('$DUR')-3))"):d=3,atrim=0:$DUR[bg];\
    [0:a]volume=1.0[fg];\
    [fg][bg]amix=inputs=2:duration=first:dropout_transition=2[a]\
  " \
  -map 0:v -map "[a]" \
  -c:v libx264 -preset slow -crf 15 -profile:v high -level 4.2 \
  -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 192k -ar 44100 -ac 2 \
  -shortest \
  "$ROOT/demo/demo-story-1080p.mp4" </dev/null

# Also 1440p sharp export for places that accept larger files
ffmpeg -y -i "$RAW" -stream_loop -1 -i "$AUDIO/bgm.wav" \
  -filter_complex "\
    [0:v]scale=2560:1440:flags=lanczos,format=yuv420p[v];\
    [1:a]volume=0.14,afade=t=in:st=0:d=2,afade=t=out:st=$(python3 -c "print(max(0, float('$DUR')-3))"):d=3,atrim=0:$DUR[bg];\
    [0:a]volume=1.0[fg];\
    [fg][bg]amix=inputs=2:duration=first:dropout_transition=2[a]\
  " \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset slow -crf 15 -profile:v high \
  -movflags +faststart -c:a aac -b:a 192k -shortest \
  "$ROOT/demo/demo-story-1440p.mp4" </dev/null

echo "==> 10. Preview GIF"
ffmpeg -y -i "$ROOT/demo/demo-story-1080p.mp4" \
  -vf "fps=10,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer" \
  "$ROOT/demo/demo-story-preview.gif" </dev/null

echo
echo "DONE:"
ls -lh "$ROOT/demo/demo-story-1080p.mp4" "$ROOT/demo/demo-story-1440p.mp4" "$ROOT/demo/demo-story-preview.gif"
ffprobe -v error -show_entries stream=width,height,codec_type -show_entries format=duration,size \
  -of default=noprint_wrappers=1 "$ROOT/demo/demo-story-1080p.mp4"
echo
echo "Post (1080p):  $ROOT/demo/demo-story-1080p.mp4"
echo "Hi-res (1440p): $ROOT/demo/demo-story-1440p.mp4"
