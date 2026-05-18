#!/usr/bin/env python3
"""
Task 6.1 — Recreate root critical files from manifest references.

For every entry in ROOT-SOURCE-MANIFEST.json (50 files) plus the 9 apps/* config
files explicitly listed in task 6.1, extract the canonical content from the
corresponding `reference/.../files/*.md` (fenced code block) and write it under
$OPENCRM_APP, then verify the file SHA-256 matches the manifest entry.

Mode:
  (default)   : extract + compute SHAs but do not write (dry-run)
  --write     : write files whose current bytes differ from expected; verify post-write SHAs
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

OPENCRM_APP = '/home/ubuntu/.openclaw/workspace/opencrm-app'
SKILL = '/home/ubuntu/.openclaw/workspace/skills/opencrm-builder-class/opencrm-builder-class'

ROOT_MANIFEST     = SKILL + '/reference/source/ROOT-SOURCE-MANIFEST.json'
BACKEND_MANIFEST  = SKILL + '/backend/reference/BACKEND-SOURCE-MANIFEST.json'
FRONTEND_MANIFEST = SKILL + '/frontend/reference/FRONTEND-SOURCE-MANIFEST.json'

# Reference paths in all three manifests are stored relative to the SKILL root:
#   ROOT     manifest entries: "reference/source/files/..."
#   BACKEND  manifest entries: "backend/reference/files/..."
#   FRONTEND manifest entries: "frontend/reference/files/..."
ROOT_BASE     = SKILL
BACKEND_BASE  = SKILL
FRONTEND_BASE = SKILL

# Apps config files explicitly enumerated in task 6.1
FOCUS_APPS_FILES = {
    'apps/backend/package.json',
    'apps/backend/tsconfig.json',
    'apps/backend/prisma.config.ts',
    'apps/backend/Dockerfile',
    'apps/frontend/package.json',
    'apps/frontend/tsconfig.json',
    'apps/frontend/vite.config.ts',
    'apps/frontend/components.json',
    'apps/frontend/Dockerfile',
}

# Files that need executable bit set after write (per task 6.1).
EXEC_FILES = {
    'run-backend.sh',
    'run-frontend.sh',
}


def extract_canonical(md_bytes: bytes) -> bytes:
    """Return the bytes inside the first fenced code block of a reference .md."""
    text = md_bytes.decode('utf-8')
    lines = text.split('\n')
    open_idx = None
    fence_str = None
    for i, line in enumerate(lines):
        m = re.match(r'^(`{3,})', line)
        if m:
            open_idx = i
            fence_str = m.group(1)
            break
    if open_idx is None:
        raise ValueError('no opening fence found')
    close_idx = None
    for j in range(open_idx + 1, len(lines)):
        if lines[j] == fence_str:
            close_idx = j
            break
    if close_idx is None:
        raise ValueError('no closing fence found')
    inner = lines[open_idx + 1:close_idx]
    return ('\n'.join(inner)).encode('utf-8')


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(path: str) -> str:
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def check_write_path(path: str) -> bool:
    """Use $OPENCRM_APP/scripts/spec/check-write-path.sh to confirm path is allowed."""
    helper = OPENCRM_APP + '/scripts/spec/check-write-path.sh'
    res = subprocess.run([helper, path], capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write(res.stderr)
    return res.returncode == 0


def build_entries():
    """Return list of dicts: {target, ref, expected_sha, expected_bytes, source}."""
    entries = []
    seen = set()

    # 1. Root manifest: every entry (50 files)
    m = json.load(open(ROOT_MANIFEST))
    for f in m['files']:
        target = f['path']
        ref = ROOT_BASE + '/' + f['reference']
        entries.append({
            'target': target,
            'ref': ref,
            'expected_sha': f['sha256'],
            'expected_bytes': f['bytes'],
            'source': 'root',
        })
        seen.add(target)

    # 2. Backend manifest: only the apps/backend/* config files in focus list
    m = json.load(open(BACKEND_MANIFEST))
    for f in m['files']:
        target = f['path']
        if target in FOCUS_APPS_FILES and target not in seen:
            ref = BACKEND_BASE + '/' + f['reference']
            entries.append({
                'target': target,
                'ref': ref,
                'expected_sha': f['sha256'],
                'expected_bytes': f['bytes'],
                'source': 'backend',
            })
            seen.add(target)

    # 3. Frontend manifest: only the apps/frontend/* config files in focus list
    m = json.load(open(FRONTEND_MANIFEST))
    for f in m['files']:
        target = f['path']
        if target in FOCUS_APPS_FILES and target not in seen:
            ref = FRONTEND_BASE + '/' + f['reference']
            entries.append({
                'target': target,
                'ref': ref,
                'expected_sha': f['sha256'],
                'expected_bytes': f['bytes'],
                'source': 'frontend',
            })
            seen.add(target)

    missing = FOCUS_APPS_FILES - seen
    if missing:
        raise RuntimeError(f'focus apps files unresolved: {missing}')
    return entries


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true', help='actually write files')
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args(argv)

    entries = build_entries()
    print(f'Total entries: {len(entries)}')
    print(f'  root     : {sum(1 for e in entries if e["source"] == "root")}')
    print(f'  backend  : {sum(1 for e in entries if e["source"] == "backend")}')
    print(f'  frontend : {sum(1 for e in entries if e["source"] == "frontend")}')

    print('\n=== PHASE 1: Extract + verify against manifest SHA ===')
    extract_failures = []
    for e in entries:
        if not os.path.isfile(e['ref']):
            extract_failures.append((e['target'], 'reference missing: ' + e['ref']))
            continue
        try:
            content = extract_canonical(open(e['ref'], 'rb').read())
        except Exception as ex:
            extract_failures.append((e['target'], f'extract error: {ex}'))
            continue
        actual_sha = sha256_bytes(content)
        if actual_sha != e['expected_sha'] or len(content) != e['expected_bytes']:
            extract_failures.append((
                e['target'],
                f"extracted SHA/bytes mismatch manifest: "
                f"got {actual_sha[:16]}..({len(content)}B) "
                f"expected {e['expected_sha'][:16]}..({e['expected_bytes']}B)"
            ))
        else:
            e['extracted'] = content
    if extract_failures:
        print(f'\nEXTRACTION FAILURES ({len(extract_failures)}):')
        for t, msg in extract_failures:
            print(f'  {t}: {msg}')
        print('\nABORT: extraction phase failed; refusing to write.')
        return 2
    print(f'  OK: all {len(entries)} extractions match manifest SHA')

    print('\n=== PHASE 2: Classify current state ===')
    same = []
    diff = []
    missing = []
    for e in entries:
        target_path = os.path.join(OPENCRM_APP, e['target'])
        if not os.path.isfile(target_path):
            missing.append(e)
            continue
        cur_sha = sha256_file(target_path)
        if cur_sha == e['expected_sha']:
            same.append(e)
        else:
            diff.append((e, cur_sha))
    print(f'  match (no-op): {len(same)}')
    print(f'  diff (will rewrite): {len(diff)}')
    for e, cs in diff:
        print(f'    {e["target"]} cur={cs[:16]}.. exp={e["expected_sha"][:16]}..')
    print(f'  missing (will create): {len(missing)}')
    for e in missing:
        print(f'    {e["target"]}')

    if not args.write:
        print('\n[dry-run] not writing.')
        return 0

    print('\n=== PHASE 3: Guardrail check (check-write-path.sh) ===')
    targets_to_write = [os.path.join(OPENCRM_APP, e['target']) for e, _ in diff] + \
                       [os.path.join(OPENCRM_APP, e['target']) for e in missing]
    for tp in targets_to_write:
        if not check_write_path(tp):
            print(f'  REJECT: {tp}')
            return 3
    print(f'  OK: all {len(targets_to_write)} write targets pass guardrail')

    print('\n=== PHASE 4: Write ===')
    written = []
    for e, _ in diff:
        target_path = os.path.join(OPENCRM_APP, e['target'])
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, 'wb') as fh:
            fh.write(e['extracted'])
        written.append(e['target'])
        if args.verbose:
            print(f'  wrote {e["target"]}')
    for e in missing:
        target_path = os.path.join(OPENCRM_APP, e['target'])
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, 'wb') as fh:
            fh.write(e['extracted'])
        written.append(e['target'])
        if args.verbose:
            print(f'  created {e["target"]}')
    print(f'  total written: {len(written)}')

    print('\n=== PHASE 5: chmod +x for shell scripts ===')
    for rel in EXEC_FILES:
        tp = os.path.join(OPENCRM_APP, rel)
        if not os.path.isfile(tp):
            print(f'  {rel}: MISSING')
            continue
        st = os.stat(tp)
        new_mode = st.st_mode | 0o111
        os.chmod(tp, new_mode)
        print(f'  {rel}: {oct(new_mode)}')

    print('\n=== PHASE 6: Post-write SHA verification ===')
    pass_count = 0
    fail_list = []
    for e in entries:
        target_path = os.path.join(OPENCRM_APP, e['target'])
        if not os.path.isfile(target_path):
            fail_list.append((e['target'], 'FILE MISSING'))
            continue
        cur = sha256_file(target_path)
        if cur == e['expected_sha']:
            pass_count += 1
        else:
            fail_list.append((e['target'], f'SHA mismatch cur={cur[:16]}.. exp={e["expected_sha"][:16]}..'))
    print(f'  match: {pass_count}/{len(entries)}')
    if fail_list:
        print(f'  MISMATCH ({len(fail_list)}):')
        for t, m in fail_list:
            print(f'    {t}: {m}')
        return 4
    print('  OK: all entries match expected SHA after write')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
