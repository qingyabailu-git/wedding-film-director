"""Declared coverage + optional full decode and actual encoded-frame evidence.
Does not infer source identity or occlusion from pixels. Visual review is required.
"""
import argparse
import csv
import html
import json
import math
import subprocess
from pathlib import Path
from urllib.parse import quote


def audit(catalog, timeline, min_visible):
    items = {i['id']: i for i in catalog['items']}
    if len(items) != len(catalog['items']):
        raise ValueError('Duplicate catalog IDs')
    duration = float(timeline['duration'])
    if not math.isfinite(duration) or duration <= 0 or min_visible < 0:
        raise ValueError('Invalid duration/threshold')
    errors, warnings, by_id = [], [], {}
    for n, p in enumerate(timeline['placements']):
        sid = p['id']
        if sid not in items:
            errors.append(f'Unknown ID: {sid}')
            continue
        if items[sid].get('exclude_reason') or items[sid]['status'] == 'excluded':
            errors.append(f'Excluded ID placed: {sid}')
        try:
            a, va, vb, b = [float(p[k]) for k in ('start', 'visible_start', 'visible_end', 'end')]
            if not all(math.isfinite(v) for v in (a, va, vb, b)) or not 0 <= a <= va < vb <= b <= duration+.001:
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            errors.append(f'Invalid placement times at {n}: {sid}')
            continue
        by_id.setdefault(sid, []).append(p)
    rows = []
    for sid, item in items.items():
        pp = by_id.get(sid, [])
        longest = max((p['visible_end']-p['visible_start'] for p in pp), default=0)
        required = item['status'] == 'ready' and not item.get('exclude_reason')
        if required and not pp:
            errors.append(f'Missing required ID: {sid}')
        elif required and longest < min_visible:
            warnings.append(f'Short continuous exposure {sid}: {longest:.3f}s')
        if item['status'] == 'probe_error':
            warnings.append(f'Unresolved source decoding: {sid}')
        best = max(pp, key=lambda p:p['visible_end']-p['visible_start']) if pp else None
        rows.append(dict(id=sid, filename=item['filename'], status=item['status'],
                         exclude_reason=item.get('exclude_reason') or '', placements=len(pp),
                         longest_visible=round(longest, 4),
                         proof_time=(best['visible_start']+best['visible_end'])/2 if best else None,
                         source_path=item['path']))
    # Compute gaps in declared narrative-media visibility, including beginning/end.
    intervals = sorted((p['visible_start'], p['visible_end']) for pp in by_id.values() for p in pp)
    cursor, gaps = 0.0, []
    for a, b in intervals:
        if a > cursor+.001:
            gaps.append([round(cursor, 4), round(a, 4)])
        cursor = max(cursor, b)
    if cursor < duration-.001:
        gaps.append([round(cursor, 4), duration])
    for gap in gaps:
        warnings.append(f'Review narrative-media gap: {gap}; may be an intentional title/transition')
    return dict(schema=1, errors=errors, warnings=warnings, rows=rows, declared_media_gaps=gaps,
                declared_coverage_ok=not errors, visual_identity_review='required',
                note='Placement metadata is a claim, not proof of correct visible pixels. Midpoint images do not check entire exposure or motion.')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--catalog', required=True)
    p.add_argument('--timeline', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--min-visible', type=float, default=2.0)
    p.add_argument('--video')
    p.add_argument('--proofs', action='store_true')
    p.add_argument('--ffmpeg', default='ffmpeg')
    p.add_argument('--ffprobe', default='ffprobe')
    a = p.parse_args()
    if a.proofs and not a.video:
        p.error('--proofs requires --video')
    load = lambda f: json.loads(Path(f).read_text(encoding='utf-8-sig'))
    timeline = load(a.timeline)
    report = audit(load(a.catalog), timeline, a.min_visible)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    if a.video:
        media = json.loads(subprocess.check_output([a.ffprobe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', a.video]))
        report['media'] = media
        actual_duration = float(media['format']['duration'])
        tolerance = max(.1, 2/float(timeline.get('fps', 30)))
        if abs(actual_duration-timeline['duration']) > tolerance:
            report['errors'].append(f'Duration mismatch: {actual_duration} vs {timeline["duration"]}')
        kinds = {s['codec_type'] for s in media['streams']}
        if not {'video', 'audio'} <= kinds:
            report['errors'].append('Final must contain video and audio streams')
        proc = subprocess.run([a.ffmpeg, '-v', 'error', '-xerror', '-i', a.video, '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-'], capture_output=True)
        report['full_decode_exit_code'] = proc.returncode
        (out/'decode.log').write_bytes(proc.stderr)
        if proc.returncode or proc.stderr.strip():
            report['errors'].append('Decode failed or emitted errors; inspect decode.log')
    cards = []
    if a.proofs:
        image_dir = out/'encoded-frames'
        image_dir.mkdir(exist_ok=True)
        times = sorted({round(r['proof_time'], 6) for r in report['rows'] if r['proof_time'] is not None})
        images = {}
        for i, time in enumerate(times):
            path = image_dir/f'{i:04d}.jpg'
            subprocess.run([a.ffmpeg, '-v', 'error', '-y', '-ss', str(time), '-i', a.video,
                            '-frames:v', '1', '-q:v', '2', str(path)], check=True)
            if not path.is_file() or not path.stat().st_size:
                raise RuntimeError(f'Missing decoded proof at {time}')
            images[time] = path.relative_to(out).as_posix()
        for row in report['rows']:
            if row['proof_time'] is None:
                continue
            t = row['proof_time']
            img = quote(images[round(t, 6)])
            sid, name = html.escape(row['id']), html.escape(row['filename'])
            source = html.escape(Path(row['source_path']).resolve().as_uri(), quote=True)
            cards.append(f'<article><h3>{sid} · {name}</h3><p><a href="{source}">原素材</a> · 最长连续展示 {row["longest_visible"]}s</p><button data-time="{t}">定位 {t:.3f}s</button><img src="{img}" alt="最终编码画面，仍需对照原素材"></article>')
        video_uri = html.escape(Path(a.video).resolve().as_uri(), quote=True)
        document = '''<!doctype html><meta charset="utf-8"><title>素材成片对照</title><style>body{background:#151515;color:#eee;font:16px sans-serif;margin:24px}video{width:80vw;max-height:55vh;position:sticky;top:0;background:black}main{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}img{width:100%}article{border:1px solid #555;padding:12px}a{color:#ffb8c5}</style><h1>原素材与最终编码画面对照</h1><p>本页证明取到了成片画面；请逐项确认素材身份、遮挡与可读时间。浏览器若限制本地媒体，请从工程的本地预览服务打开。</p>'''
        document += f'<video controls src="{video_uri}"></video><main>'+''.join(cards)+'</main>'
        document += '<script>document.addEventListener("click",e=>{if(e.target.dataset.time){const v=document.querySelector("video");v.currentTime=Number(e.target.dataset.time);}});</script>'
        (out/'source-index.html').write_text(document, encoding='utf-8')
        report['encoded_proof_frames'] = len(images)
    with (out/'coverage.csv').open('w', encoding='utf-8-sig', newline='') as f:
        if report['rows']:
            w = csv.DictWriter(f, fieldnames=report['rows'][0].keys())
            w.writeheader()
            w.writerows(report['rows'])
    report['technical_checks_ok'] = not report['errors']
    (out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'errors': len(report['errors']), 'warnings': len(report['warnings']), 'visual_review': 'required', 'out': str(out)}))
    raise SystemExit(2 if report['errors'] else 0)


if __name__ == '__main__':
    main()
