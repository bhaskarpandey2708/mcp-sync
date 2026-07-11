#!/bin/sh
# Build narrative launch video:
#   - CTA-first story with brand magnets (Claude / Cursor / Copilot)
#   - Rare, subtle Ken Burns aimed at emphasis (not center-crop thrash)
#   - Terminal FULLY readable — no continuous zoom
#   - Soft BGM + keyclicks
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STORY="$ROOT/demo/story"
AUDIO="$STORY/audio"
mkdir -p "$STORY" "$AUDIO"

if [ "${SKIP_SLIDES:-}" = "1" ] && [ -f "$STORY/manifest.json" ]; then
  echo "==> 1. High-DPI typewriter slides (skipped)"
else
  echo "==> 1. High-DPI typewriter slides"
  python3 demo/make_story_slides.py
fi

echo "==> 2. Ensure CLI built"
if [ ! -f dist/cli.js ]; then
  echo "dist/cli.js missing — run npm run build first" >&2
  exit 1
fi

echo "==> 3. Soft ambient BGM + SFX"
ffmpeg -y -f lavfi -i "sine=frequency=110:sample_rate=44100:duration=200" \
  -f lavfi -i "sine=frequency=164.81:sample_rate=44100:duration=200" \
  -f lavfi -i "sine=frequency=220:sample_rate=44100:duration=200" \
  -filter_complex "\
    [0]volume=0.035[a];\
    [1]volume=0.028[b];\
    [2]volume=0.018[c];\
    [a][b][c]amix=inputs=3:duration=longest,\
    highpass=f=80,lowpass=f=2000,\
    afade=t=in:st=0:d=2.5,volume=0.55\
  " -ac 2 "$AUDIO/bgm.wav" </dev/null

# Soft, quiet keyclick (not loud/machinegun) — short low blip + silence pad for slow pace
ffmpeg -y -f lavfi -i "sine=frequency=780:sample_rate=44100:duration=0.016" \
  -af "volume=0.045,afade=t=out:st=0.003:d=0.012,lowpass=f=2200" -ac 1 "$AUDIO/tick_raw.wav" </dev/null
# ~11 soft clicks/sec (0.016s sound + ~0.075s gap) instead of rapid fire
ffmpeg -y -i "$AUDIO/tick_raw.wav" -af "apad=pad_dur=0.075" -ac 1 "$AUDIO/tick.wav" </dev/null

ffmpeg -y -f lavfi -i "anoisesrc=color=pink:amplitude=0.12:sample_rate=44100:duration=0.28" \
  -af "highpass=f=400,lowpass=f=2800,afade=t=in:st=0:d=0.04,afade=t=out:st=0.12:d=0.16,volume=0.06" \
  -ac 1 "$AUDIO/whoosh.wav" </dev/null

# Pull zoom + focus + zoom_max from manifest for one slide id
slide_meta() {
  id="$1"
  field="$2" # zoom | zoom_max | fx | fy
  python3 -c "
import json
m=json.load(open('$STORY/manifest.json'))
for s in m['slides']:
    if s['id']=='$id':
        if '$field'=='zoom':
            print(s.get('zoom','none'))
        elif '$field'=='zoom_max':
            print(s.get('zoom_max', 1.05))
        elif '$field'=='fx':
            print(s.get('focus',[0.5,0.45])[0])
        elif '$field'=='fy':
            print(s.get('focus',[0.5,0.45])[1])
        break
else:
    defaults={'zoom':'none','zoom_max':'1.0','fx':'0.5','fy':'0.45'}
    print(defaults.get('$field','none'))
"
}

# Encode frames → 1080p.
# zoom=none → plain scale (NO crop).
# zoom=in/out → tiny Ken Burns around focus point, clamped so text stays in frame.
frames_to_video() {
  id="$1"
  out="$2"
  dir="$STORY/frames/$id"
  zoom="$(slide_meta "$id" zoom)"
  zmax="$(slide_meta "$id" zoom_max)"
  fx="$(slide_meta "$id" fx)"
  fy="$(slide_meta "$id" fy)"
  nframes=$(ls "$dir"/f*.png | wc -l | tr -d ' ')

  if [ "$zoom" = "none" ] || [ "$zmax" = "1.0" ] || [ "$zmax" = "1" ]; then
    echo "    camera=static  frames=$nframes"
    ffmpeg -y -framerate 30 -i "$dir/f%05d.png" \
      -vf "scale=1920:1080:flags=lanczos,format=yuv420p" \
      -c:v libx264 -preset veryfast -crf 15 -pix_fmt yuv420p -an \
      "$out" </dev/null
    return
  fi

  # Focus-aware zoompan:
  # x = focus_x * (iw - iw/z) so the emphasis region stays near viewport center
  # y = focus_y * (ih - ih/z)
  case "$zoom" in
    out)
      # start slightly tight on focus, ease to full frame
      zexpr="if(eq(on,1),${zmax},max(${zmax}-(${zmax}-1.0)*on/${nframes},1.0))"
      ;;
    *)
      # gentle push-in toward focus (default for zoom=in)
      zexpr="min(1.0+(${zmax}-1.0)*on/${nframes},${zmax})"
      ;;
  esac

  echo "    camera=$zoom focus=($fx,$fy) max=$zmax frames=$nframes"
  ffmpeg -y -framerate 30 -i "$dir/f%05d.png" \
    -vf "zoompan=z='${zexpr}':\
x='${fx}*(iw-iw/zoom)':\
y='${fy}*(ih-ih/zoom)':\
d=1:s=1920x1080:fps=30,format=yuv420p" \
    -c:v libx264 -preset veryfast -crf 15 -pix_fmt yuv420p -an \
    "$out" </dev/null
}

add_typing_audio() {
  in="$1"
  out="$2"
  tag="$3"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
  # Soft typing only during the typewriter phase (~45% of clip), quiet mix
  type_win=$(python3 -c "print(max(0.7, float('$dur') * 0.42))")
  ffmpeg -y -stream_loop -1 -i "$AUDIO/tick.wav" -t "$type_win" \
    -af "volume=0.55,apad=whole_dur=$dur" -ac 2 "$AUDIO/ticks_$tag.wav" </dev/null 2>/dev/null || \
  ffmpeg -y -i "$AUDIO/tick.wav" -af "aloop=loop=30:size=4000,volume=0.4" -t "$dur" -ac 2 "$AUDIO/ticks_$tag.wav" </dev/null

  fade_at=$(python3 -c "print(max(0.2, float('$type_win')-0.35))")
  ffmpeg -y -i "$in" -i "$AUDIO/ticks_$tag.wav" \
    -filter_complex "[1]volume=0.11,afade=t=out:st=${fade_at}:d=0.4[t];[t]apad=whole_dur=$dur[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k -shortest "$out" </dev/null
}

SLIDE_IDS="01-open-cta 02-hook 03-what-is-mcp 04-problem 05-pain 06-solution 07-safety 08-demo-intro 09-cap-status 10-cap-dryrun 11-cap-sync 12-cap-done 99-cta"

echo "==> 4. Encode typed slide clips (static by default, rare soft focus-zoom)"
for id in $SLIDE_IDS; do
  echo "  clip $id"
  frames_to_video "$id" "$STORY/v_${id}.mp4"
  add_typing_audio "$STORY/v_${id}.mp4" "$STORY/a_${id}.mp4" "$id"
done

echo "==> 5. Terminal segments (VHS — large font, fully readable)"
vhs demo/demo-story.tape
vhs demo/demo-story-dry.tape
vhs demo/demo-story-sync.tape
vhs demo/demo-story-done.tape

# Terminal: full frame, no crop — every character of CLI output stays visible
prep_term() {
  in="$1"
  out="$2"
  ffmpeg -y -i "$in" \
    -vf "scale=1920:1080:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset veryfast -crf 15 -an \
    "$STORY/_term_tmp.mp4" </dev/null

  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$STORY/_term_tmp.mp4")
  ffmpeg -y -i "$STORY/_term_tmp.mp4" -i "$AUDIO/whoosh.wav" \
    -filter_complex "[1]volume=0.14,apad=whole_dur=$dur[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k -shortest "$out" </dev/null
  rm -f "$STORY/_term_tmp.mp4"
}

echo "==> 6. Prep terminal (full frame — no crop)"
prep_term "$STORY/term-status.mp4" "$STORY/term-status-z.mp4"
prep_term "$STORY/term-dryrun.mp4" "$STORY/term-dryrun-z.mp4"
prep_term "$STORY/term-sync.mp4" "$STORY/term-sync-z.mp4"
prep_term "$STORY/term-done.mp4" "$STORY/term-done-z.mp4"

echo "==> 7. Normalize all clips"
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

for id in $SLIDE_IDS; do
  normalize "$STORY/a_${id}.mp4" "$STORY/n_${id}.mp4"
done
normalize "$STORY/term-status-z.mp4" "$STORY/n_term-status.mp4"
normalize "$STORY/term-dryrun-z.mp4" "$STORY/n_term-dryrun.mp4"
normalize "$STORY/term-sync-z.mp4" "$STORY/n_term-sync.mp4"
normalize "$STORY/term-done-z.mp4" "$STORY/n_term-done.mp4"

echo "==> 8. Concatenate"
LIST="$STORY/concat.txt"
cat > "$LIST" <<EOF
file 'n_01-open-cta.mp4'
file 'n_02-hook.mp4'
file 'n_03-what-is-mcp.mp4'
file 'n_04-problem.mp4'
file 'n_05-pain.mp4'
file 'n_06-solution.mp4'
file 'n_07-safety.mp4'
file 'n_08-demo-intro.mp4'
file 'n_09-cap-status.mp4'
file 'n_term-status.mp4'
file 'n_10-cap-dryrun.mp4'
file 'n_term-dryrun.mp4'
file 'n_11-cap-sync.mp4'
file 'n_term-sync.mp4'
file 'n_12-cap-done.mp4'
file 'n_term-done.mp4'
file 'n_99-cta.mp4'
EOF

RAW="$STORY/story-raw.mp4"
ffmpeg -y -f concat -safe 0 -i "$LIST" -c copy "$RAW" </dev/null

echo "==> 9. Mix BGM + final encode"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$RAW")
FADE_OUT=$(python3 -c "print(max(0, float('$DUR')-3))")

ffmpeg -y -i "$RAW" -stream_loop -1 -i "$AUDIO/bgm.wav" \
  -filter_complex "\
    [1:a]volume=0.11,afade=t=in:st=0:d=2,afade=t=out:st=${FADE_OUT}:d=3,atrim=0:$DUR[bg];\
    [0:a]volume=1.0[fg];\
    [fg][bg]amix=inputs=2:duration=first:dropout_transition=2[a]\
  " \
  -map 0:v -map "[a]" \
  -c:v libx264 -preset slow -crf 15 -profile:v high -level 4.2 \
  -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 192k -ar 44100 -ac 2 \
  -shortest \
  "$ROOT/demo/demo-story-1080p.mp4" </dev/null

ffmpeg -y -i "$RAW" -stream_loop -1 -i "$AUDIO/bgm.wav" \
  -filter_complex "\
    [0:v]scale=2560:1440:flags=lanczos,format=yuv420p[v];\
    [1:a]volume=0.11,afade=t=in:st=0:d=2,afade=t=out:st=${FADE_OUT}:d=3,atrim=0:$DUR[bg];\
    [0:a]volume=1.0[fg];\
    [fg][bg]amix=inputs=2:duration=first:dropout_transition=2[a]\
  " \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset slow -crf 15 -profile:v high \
  -movflags +faststart -c:a aac -b:a 192k -shortest \
  "$ROOT/demo/demo-story-1440p.mp4" </dev/null

echo "==> 10. Preview GIF (open CTA + hook)"
ffmpeg -y -i "$ROOT/demo/demo-story-1080p.mp4" -t 16 \
  -vf "fps=10,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer" \
  "$ROOT/demo/demo-story-preview.gif" </dev/null

echo
echo "DONE:"
ls -lh "$ROOT/demo/demo-story-1080p.mp4" "$ROOT/demo/demo-story-1440p.mp4" "$ROOT/demo/demo-story-preview.gif"
ffprobe -v error -show_entries stream=width,height,codec_type -show_entries format=duration,size \
  -of default=noprint_wrappers=1 "$ROOT/demo/demo-story-1080p.mp4"
echo
echo "Post: $ROOT/demo/demo-story-1080p.mp4"
echo "Camera: static by default | soft focus-zoom only on 02-hook, 05-pain, 06-solution | terminal NEVER zooms"
