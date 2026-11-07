"""Zips a built web game (its dist/ folder) for itch.io: index.html at the top, forward slashes in
every path (Windows' Compress-Archive writes backslashes, which break on itch's servers).

Usage: python scripts/zip-itch.py <dist folder> <zip file>
"""
import os
import sys
import zipfile

dist, out = sys.argv[1], sys.argv[2]
if not os.path.isfile(os.path.join(dist, 'index.html')):
    sys.exit(f'no index.html in {dist}')
if os.path.exists(out):
    os.remove(out)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(dist):
        for name in sorted(files):
            path = os.path.join(root, name)
            z.write(path, os.path.relpath(path, dist).replace(os.sep, '/'))
with zipfile.ZipFile(out) as z:
    for info in z.infolist():
        print(f'{info.file_size:>10}  {info.filename}')
print(f'{os.path.getsize(out):>10}  {out}')
