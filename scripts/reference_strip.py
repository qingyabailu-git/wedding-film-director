"""Extract a bounded continuous reference passage plus timestamped storyboard."""
import argparse
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('video')
    p.add_argument('--start', type=float, required=True)
    p.add_argument('--duration', type=float, required=True)
    p.add_argument('--sample-fps', type=float, default=6)
    p.add_argument('--out', required=True)
    p.add_argument('--ffmpeg', default='ffmpeg')
    a = p.parse_args()
    if a.start < 0 or not 0 < a.duration <= 30 or not 0 < a.sample_fps <= 30 or a.duration*a.sample_fps > 240:
        p.error('Use a 0–30s range with at most 240 samples; split longer passages.')
    out = Path(a.out)
    if out.exists() and any(out.iterdir()):
        p.error('Output directory must be empty, to avoid mixing frame sequences.')
    out.mkdir(parents=True, exist_ok=True)
    base = [a.ffmpeg, '-v', 'error', '-y', '-ss', str(a.start), '-i', a.video, '-t', str(a.duration)]
    subprocess.run(base + ['-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', str(out/'motion.mp4')], check=True)
    subprocess.run(base + ['-vf', f'fps={a.sample_fps},scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2', str(out/'frame-%04d.jpg')], check=True)
    files = sorted(out.glob('frame-*.jpg'))
    if not files:
        raise RuntimeError('No frames; check source range')
    # Paginate instead of generating one impractically tall image.
    for page in range(0, len(files), 24):
        batch = files[page:page+24]
        sheet = Image.new('RGB', (1280, ((len(batch)+3)//4)*204), '#161616')
        draw = ImageDraw.Draw(sheet)
        for j, file in enumerate(batch):
            x, y = (j%4)*320, (j//4)*204
            with Image.open(file) as im:
                sheet.paste(im, (x, y))
            draw.text((x+5, y+184), f'~ source {a.start+(page+j)/a.sample_fps:.3f}s', fill='white')
        sheet.save(out/f'strip-{page//24+1:02}.jpg')
    (out/'range.json').write_text(json.dumps(dict(start=a.start, duration=a.duration, sample_fps=a.sample_fps,
        frames=len(files), note='Labels are resampled approximate source times, NOT original VFR frame PTS. Watch motion.mp4 at normal speed.')), encoding='utf-8')
    print(json.dumps({'frames': len(files), 'out': str(out)}))


if __name__ == '__main__':
    main()
