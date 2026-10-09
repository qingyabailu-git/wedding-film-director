"""Suggest audio attacks and periodicities; never claims downbeat/lyric verification."""
import argparse
import json
import subprocess
from pathlib import Path
import numpy as np


def analyze(x, sr=16000, trim=0, fps=30, silence_db=-48):
    if fps <= 0 or trim < 0 or not np.all(np.isfinite(x)):
        raise ValueError('Invalid fps, trim or samples')
    if len(x) < 1024 or trim >= len(x) / sr:
        raise ValueError('Audio too short or trim outside audio')
    # 20 ms RMS only suggests first sound; quiet intros require listening.
    n = len(x) // 320
    rms = np.sqrt(np.mean(x[:n*320].reshape(n, 320)**2, axis=1))
    audible = np.flatnonzero(rms > 10**(silence_db/20))
    first = float(audible[0] * .02) if len(audible) else None
    y = x[round(trim*sr):]
    if len(y) < 512:
        raise ValueError('Trim leaves too little audio')
    frames = np.lib.stride_tricks.sliding_window_view(y, 512)[::160]
    magnitude = np.log1p(np.abs(np.fft.rfft(frames * np.hanning(512), axis=1))*100)
    delta = np.maximum(np.diff(magnitude, axis=0, prepend=magnitude[:1]), 0)
    freq = np.fft.rfftfreq(512, 1/sr)
    low = delta[:, (freq >= 40) & (freq <= 180)].mean(axis=1)
    high = delta[:, (freq >= 1800) & (freq <= 7000)].mean(axis=1)
    norm = lambda a: a / max(float(np.quantile(a, .9)), float(a.max())*.05, 1e-9)
    flux = .7*norm(low) + .3*norm(high)
    times = (np.arange(len(flux))*160+256)/sr
    threshold = max(float(np.quantile(flux, .72)), float(flux.max())*.08)
    peaks = np.flatnonzero((flux[1:-1] > flux[:-2]) & (flux[1:-1] >= flux[2:]) & (flux[1:-1] > threshold)) + 1
    selected = []
    for i in sorted(peaks, key=lambda j: -flux[j]):
        if all(abs(int(i)-j) >= 12 for j in selected):
            selected.append(int(i))
    attacks = [dict(time=round(float(times[i]), 5), source_time=round(float(times[i]+trim), 5),
                    frame=round(float(times[i])*fps), strength=round(float(flux[i]), 4), verified=False)
               for i in sorted(selected)]
    centered = flux-flux.mean()
    ranked = []
    for lag in range(33, min(151, len(flux)//2)):
        lhs, rhs = centered[:-lag], centered[lag:]
        score = float(np.dot(lhs, rhs) / max(np.linalg.norm(lhs)*np.linalg.norm(rhs), 1e-9))
        ranked.append((score, 60/(lag*.01)))
    candidates = []
    for score, bpm in sorted(ranked, reverse=True):
        if score <= 0:
            continue
        if all(abs(bpm-c['bpm']) > 3 for c in candidates):
            candidates.append(dict(bpm=round(bpm, 3), correlation=round(score, 4), verified=False))
        if len(candidates) == 6:
            break
    return dict(schema=1, source_duration=len(x)/sr, source_trim_start=trim, duration=len(y)/sr,
                leading_sound_candidate=first, silence_threshold_db=silence_db, fps=fps,
                attacks=attacks, tempo_candidates=candidates, verified=False,
                limitations=['Not a downbeat detector', 'Listen before trimming quiet intro',
                             'Check half/double tempo and local phase per section', 'No lyric transcription'])


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('audio')
    p.add_argument('--out', required=True)
    p.add_argument('--trim', type=float, default=0)
    p.add_argument('--fps', type=float, default=30)
    p.add_argument('--ffmpeg', default='ffmpeg')
    a = p.parse_args()
    data = subprocess.check_output([a.ffmpeg, '-v', 'error', '-i', a.audio, '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'])
    result = analyze(np.frombuffer(data, dtype='<f4'), trim=a.trim, fps=a.fps)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'attacks': len(result['attacks']), 'candidates': result['tempo_candidates'], 'out': str(out)}))


if __name__ == '__main__':
    main()
