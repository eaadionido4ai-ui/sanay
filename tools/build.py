#!/usr/bin/env python3
"""Builds the Apps Script files from the sources in this repository.

  src/app.html            ->  apps-script/Index.html   (the page, ready for HtmlService)
  assets/logos/*          ->  apps-script/Logos.gs     (logos as data: URIs)
  assets/figure/*.svg     ->  apps-script/Logos.gs     (the half Oblation at the right edge of the pages)

Run from anywhere:  python3 tools/build.py
"""
import base64
import json
import mimetypes
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src' / 'app.html'
OUT = ROOT / 'apps-script'
LOGO_DIR = ROOT / 'assets' / 'logos'
FIGURE = ROOT / 'assets' / 'figure' / 'oblation.svg'

BODY_MARK = '<!-- sanay:body -->'
BRAND_MARK = '<!-- sanay:brand -->'
# Written into the page by Code.gs doGet(): name, acronym, logos and template header.
BRAND_SCRIPT = '<script>window.SANAY_BRAND = <?!= brand ?>;</script>'


def build_index():
    page = SRC.read_text(encoding='utf-8')
    if page.count(BODY_MARK) != 1 or page.count(BRAND_MARK) != 1:
        sys.exit('src/app.html must contain each marker once: %s and %s' % (BODY_MARK, BRAND_MARK))
    if '<?' in page:
        sys.exit('src/app.html must not contain "<?": Apps Script would read it as template code.')
    head, body = page.split(BODY_MARK)
    head = '\n'.join(line for line in head.splitlines()
                     if 'claude:viewport-fit-sides' not in line)  # only meaningful in the Claude preview
    head = head.replace(BRAND_MARK, BRAND_SCRIPT)
    html = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<base target="_top">\n<meta charset="utf-8">\n'
            + head.strip() + '\n</head>\n<body>\n' + body.strip() + '\n</body>\n</html>\n')
    (OUT / 'Index.html').write_text(html, encoding='utf-8')
    return len(html)


def build_logos():
    meta = json.loads((LOGO_DIR / 'logos.json').read_text(encoding='utf-8'))
    items = []
    for entry in meta:
        path = LOGO_DIR / entry['file']
        mime = mimetypes.guess_type(path.name)[0] or 'image/webp'
        data = base64.b64encode(path.read_bytes()).decode('ascii')
        items.append('  {\n    alt: %s,\n    src: \'data:%s;base64,%s\'\n  }' % (json.dumps(entry['alt']), mime, data))
    js = ('/**\n'
          ' * Logos shown on the SANAY home screen and on the printed attendance sheet, left to right.\n'
          ' * Built by tools/build.py from assets/logos. Cropped from the GAD attendance template.\n'
          ' * To use other files: replace the files in assets/logos and run the build again,\n'
          ' * or set src to an image link (https://...). Delete an entry to drop that logo.\n'
          ' */\n'
          'const LOGOS = [\n' + ',\n'.join(items) + '\n];\n')
    if FIGURE.exists():
        svg = FIGURE.read_text(encoding='utf-8')
        box = re.search(r'viewBox="([^"]+)"', svg).group(1)
        d = re.search(r'<path[^>]*\sd="([^"]+)"', svg).group(1)
        js += ('\n/**\n'
               ' * Half silhouette of the Oblation, at the right edge of the pages. Built from assets/figure/oblation.svg.\n'
               ' * Delete this to leave it out.\n'
               ' */\n'
               'const FIGURE = {\n  viewBox: %s,\n  d: %s\n};\n' % (json.dumps(box), json.dumps(d)))
    (OUT / 'Logos.gs').write_text(js, encoding='utf-8')
    return len(js)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    n1 = build_index()
    n2 = build_logos()
    print('apps-script/Index.html  %6.1f KB' % (n1 / 1024))
    print('apps-script/Logos.gs    %6.1f KB' % (n2 / 1024))
