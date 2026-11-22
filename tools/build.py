#!/usr/bin/env python3
"""Builds the Apps Script files from the sources in this repository.

  src/app.html            ->  apps-script/Index.html   (the page, ready for HtmlService)
  assets/logos/*          ->  apps-script/Logos.gs     (logos as data: URIs)
  assets/backdrop/*       ->  apps-script/Logos.gs     (the photo faded behind the woven pattern)

Run from anywhere:  python3 tools/build.py
"""
import base64
import json
import mimetypes
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src' / 'app.html'
OUT = ROOT / 'apps-script'
LOGO_DIR = ROOT / 'assets' / 'logos'
BACKDROP_DIR = ROOT / 'assets' / 'backdrop'

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
    meta_file = BACKDROP_DIR / 'backdrop.json'
    if meta_file.exists():
        meta = json.loads(meta_file.read_text(encoding='utf-8'))
        photo = BACKDROP_DIR / meta['file']
        mime = mimetypes.guess_type(photo.name)[0] or 'image/jpeg'
        data = base64.b64encode(photo.read_bytes()).decode('ascii')
        js += ('\n/**\n'
               ' * The photo faded behind the woven pattern on every page. Built from assets/backdrop.\n'
               ' * position: the part of the photo kept in view when a screen crops it (CSS background-position).\n'
               ' * fit: \'right\' stands the photo along the right edge of wide screens, fading in from the left;\n'
               ' *   \'cover\' fills the screen. Phones always show the whole photo.\n'
               ' * credit: shown in the credits box; creditLink: the photo\'s page, linked from the credit.\n'
               ' * Delete this whole BACKDROP to leave the photo out.\n'
               ' */\n'
               "const BACKDROP = {\n  src: 'data:%s;base64,%s',\n  position: %s,\n  fit: %s,\n  credit: %s,\n  creditLink: %s\n};\n"
               % (mime, data, json.dumps(meta.get('position', 'center')), json.dumps(meta.get('fit', 'cover')),
                  json.dumps(meta.get('credit', '')), json.dumps(meta.get('creditLink', ''))))
    (OUT / 'Logos.gs').write_text(js, encoding='utf-8')
    return len(js)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    n1 = build_index()
    n2 = build_logos()
    print('apps-script/Index.html  %6.1f KB' % (n1 / 1024))
    print('apps-script/Logos.gs    %6.1f KB' % (n2 / 1024))
