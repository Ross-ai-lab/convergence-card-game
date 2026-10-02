"""Generate small, exact-source artwork previews for the collection's progressive loading."""
import base64
import io
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps

request = json.load(sys.stdin)
previews = {}
for filename in request['files']:
    with Image.open(filename) as original:
        picture = ImageOps.exif_transpose(original).convert('RGB')
        picture.thumbnail((64, 64), Image.Resampling.LANCZOS)
        encoded = io.BytesIO()
        picture.save(encoded, format='WEBP', quality=45, method=6)
        previews[Path(filename).stem] = 'data:image/webp;base64,' + base64.b64encode(encoded.getvalue()).decode('ascii')
source = '// Artwork source SHA-256: ' + request['signature'] + '\n'
source += 'export const galleryPreviews: Record<string, string> = ' + json.dumps(previews, separators=(',', ':')) + ';\n'
Path(request['output']).write_text(source, encoding='utf-8', newline='\n')
print(f'Generated {len(previews)} gallery previews: {len(source.encode())} bytes')
