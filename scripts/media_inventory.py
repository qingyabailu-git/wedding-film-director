"""Inventory current originals without hashing. Renames need an explicit mapping."""
import argparse
import json
import subprocess
import uuid
from pathlib import Path

IMAGES = {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.gif', '.heic', '.heif', '.avif', '.dng', '.cr2', '.nef', '.arw'}
VIDEOS = {'.mp4', '.mov', '.m4v', '.mkv', '.avi', '.mts', '.m2ts', '.webm', '.mpg', '.mpeg', '.3gp'}


def key(path):
    return str(Path(path).resolve()).casefold()


def probe(path, ffprobe):
    kind = 'image' if path.suffix.lower() in IMAGES else 'video'
    if kind == 'image':
        from PIL import Image, ImageOps
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im)
            im.load()
            w, h = im.size
        return dict(kind=kind, width=w, height=h, duration=None, rotation=0)
    data = json.loads(subprocess.check_output([
        ffprobe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)
    ], stderr=subprocess.PIPE, timeout=90))
    v = next(s for s in data['streams'] if s['codec_type'] == 'video')
    rotation = float(v.get('tags', {}).get('rotate', 0))
    for side in v.get('side_data_list', []):
        if 'rotation' in side:
            rotation = float(side['rotation'])
    w, h = v['width'], v['height']
    if round(abs(rotation)) % 180 == 90:
        w, h = h, w
    return dict(kind=kind, width=w, height=h, rotation=rotation,
                duration=float(data['format'].get('duration', v.get('duration', 0))),
                has_audio=any(s['codec_type'] == 'audio' for s in data['streams']))


def scan(roots, previous=None, overrides=None, ffprobe='ffprobe'):
    previous = previous or {'items': []}
    overrides = overrides or {}
    old = {key(x['path']): x for x in previous['items']}
    ids = {x['id']: x for x in previous['items']}
    # Explicit path -> old ID mappings, verified by the operator before use.
    renames = {key(p): i for p, i in overrides.get('renames', {}).items()}
    excludes = overrides.get('exclude', {})
    paths = set()
    ignored = {}
    for root in roots:
        root = Path(root).resolve()
        if not root.is_dir():
            raise ValueError(f'Not a source directory: {root}')
        for p in root.rglob('*'):
            if not p.is_file():
                continue
            if p.suffix.lower() in IMAGES | VIDEOS:
                paths.add(p.resolve())
            else:
                ignored[p.suffix.lower() or '(no extension)'] = ignored.get(p.suffix.lower() or '(no extension)', 0) + 1
    items, assigned = [], set()
    for p in sorted(paths, key=lambda v: str(v).casefold()):
        before = old.get(key(p))
        if key(p) in renames:
            if renames[key(p)] not in ids:
                raise ValueError(f'Unknown rename ID: {renames[key(p)]}')
            before = ids[renames[key(p)]]
        sid = before['id'] if before else 'M' + uuid.uuid4().hex[:12]
        if sid in assigned:
            raise ValueError(f'ID mapped to multiple current paths: {sid}')
        assigned.add(sid)
        stat = p.stat()
        row = dict(id=sid, path=str(p), filename=p.name, title=p.stem,
                   bytes=stat.st_size, mtime_ns=stat.st_mtime_ns)
        reason = excludes.get(sid, excludes.get(str(p), before.get('exclude_reason') if before else None))
        row['exclude_reason'] = reason
        try:
            row.update(probe(p, ffprobe))
            row['orientation'] = 'portrait' if row['height'] > row['width'] else 'landscape' if row['width'] > row['height'] else 'square'
            row['status'] = 'excluded' if reason else 'ready'
        except Exception as exc:
            row.update(status='probe_error', error=str(exc)[:500])
        if before and key(p) != key(before['path']):
            row['previous_path'] = before['path']
        if before and (stat.st_size != before['bytes'] or stat.st_mtime_ns != before['mtime_ns']):
            row['content_metadata_changed'] = True
        items.append(row)
    missing = [x for x in previous['items'] if x['id'] not in assigned]
    candidates = []
    for row in items:
        if row['id'] in ids:
            continue
        for m in missing:
            if row['bytes'] == m['bytes']:
                candidates.append(dict(new_id=row['id'], new_path=row['path'], old_id=m['id'],
                                       old_path=m['path'], evidence='same size only; NOT verified'))
    return dict(schema=1, roots=[str(Path(r).resolve()) for r in roots], items=items,
                missing_previous=missing, rename_candidates=candidates, ignored_extensions=ignored,
                hashes_computed=0, note='IDs persist only with previous catalog; inspect probe errors and rename candidates.')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('roots', nargs='+')
    p.add_argument('--out', required=True)
    p.add_argument('--previous')
    p.add_argument('--overrides')
    p.add_argument('--ffprobe', default='ffprobe')
    a = p.parse_args()
    read = lambda f: json.loads(Path(f).read_text(encoding='utf-8-sig')) if f else None
    out = Path(a.out).resolve()
    for r in a.roots:
        if out.is_relative_to(Path(r).resolve()):
            p.error('Output must be outside source directories.')
    result = scan(a.roots, read(a.previous), read(a.overrides), a.ffprobe)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'items': len(result['items']), 'probe_errors': sum(i['status'] == 'probe_error' for i in result['items']), 'out': str(out)}))


if __name__ == '__main__':
    main()
