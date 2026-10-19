"""Local-only AI deblurring lab; no network requests, OCR, or font replacement.

Model reference: https://github.com/Royalvice/DocDiff (MIT).
Uses the already downloaded model in .local-qa/docdiff; never serves weights/photos
outside the explicit sample routes and this process's random job IDs.
"""
import argparse
import io
import json
import pathlib
import re
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parent.parent
RESULT_DIR = ROOT / '.local-qa' / 'ai-lab'
JOBS = {}
LOCK = threading.Lock()


from docdiff_engine import ready, restore


def decode(data):
    from PIL import Image
    import cv2
    import numpy as np
    with Image.open(io.BytesIO(data)) as picture:
        if picture.format not in ['PNG', 'JPEG', 'WEBP']:
            raise ValueError('仅支持 PNG、JPEG、WebP。')
        if picture.width * picture.height > 16000000:
            raise ValueError('最多支持 1600 万像素。')
        picture.load()
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError('无法解码图片。')
    return image


def run_job(job_id, image):
    import cv2
    state = JOBS[job_id]
    try:
        def update(message):
            state['message'] = message
        output, metrics = restore(image, update)
        RESULT_DIR.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(RESULT_DIR / (job_id + '.png')), output):
            raise RuntimeError('无法保存处理结果。')
        state.update(metrics, output='api/results/' + job_id + '.png', message='处理完成', status='done')
        (RESULT_DIR / (job_id + '.json')).write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception as exc:
        state.update(status='error', message='模型处理失败：' + str(exc))
    finally:
        LOCK.release()


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, body, mime='application/json; charset=utf-8'):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def allowed_host(self):
        return self.headers.get('Host') in [f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}']

    def do_GET(self):
        if not self.allowed_host():
            return self.respond(403, {'error': 'Local host required'})
        route = urlsplit(self.path).path
        if route == '/api/health':
            return self.respond(200, {'ready': ready(), 'message': '本机 DocDiff · 仅测试细节区域 · DocRes 已排除 · 图片不会上传' if ready() else '本机缺少 DocDiff 权重或模型文件，请参阅 README。'})
        if re.fullmatch(r'/api/jobs/[a-f0-9]{32}', route):
            state = JOBS.get(route.rsplit('/', 1)[1])
            return self.respond(200 if state else 404, dict(state) if state else {'error': '任务不存在'})
        routes = {'/': (ROOT/'experiments/index.html', 'text/html; charset=utf-8'),
                  '/lab.css': (ROOT/'experiments/lab.css', 'text/css; charset=utf-8'),
                  '/lab.js': (ROOT/'experiments/lab.js', 'text/javascript; charset=utf-8'),
                  '/processing-core.js': (ROOT/'processing-core.js', 'text/javascript; charset=utf-8')}
        for number, index in [('21', 0), ('22', 1)]:
            for name, suffix in [('original', 'crop'), ('appearance', 'docres')]:
                routes[f'/samples/{number}/{name}.png'] = (ROOT/f'.local-qa/fullbook{index}-{suffix}.png', 'image/png')
        for kind in ['text', 'diagram']:
            for name, suffix in [('original', 'input'), ('v24', 'v24'), ('ai', 'docdiff')]:
                routes[f'/samples/{kind}/{name}.png'] = (ROOT/f'.local-qa/ai-lab/{kind}-{suffix}.png', 'image/png')
        match = re.fullmatch(r'/api/results/([a-f0-9]{32})\.png', route)
        if match and JOBS.get(match[1], {}).get('status') == 'done':
            routes[route] = (RESULT_DIR/(match[1]+'.png'), 'image/png')
        target = routes.get(route)
        if target and target[0].is_file():
            return self.respond(200, target[0].read_bytes(), target[1])
        self.respond(404, {'error': 'Not found'})

    def do_POST(self):
        if not self.allowed_host():
            return self.respond(403, {'error': 'Local host required'})
        origin = self.headers.get('Origin')
        if origin and origin not in [f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}']:
            return self.respond(403, {'error': 'Same-origin required'})
        if self.path != '/api/jobs':
            return self.respond(404, {'error': 'Not found'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.respond(400, {'error': 'Invalid size'})
        if size < 1 or size > 20*1024*1024:
            return self.respond(413, {'error': '图片文件必须小于 20 MB。'})
        if not ready():
            return self.respond(503, {'error': '本机尚未安装 DocDiff。'})
        if not LOCK.acquire(blocking=False):
            return self.respond(409, {'error': '本机正在处理另一张图片，请稍后重试。'})
        try:
            self.connection.settimeout(30)
            data = self.rfile.read(size)
            if len(data) != size:
                raise ValueError('图片上传不完整。')
            image = decode(data)
            if max(image.shape[:2]) > 384:
                raise ValueError('先截取细节区域，最多 384 × 384 像素。')
        except Exception as exc:
            LOCK.release()
            return self.respond(400, {'error': str(exc)})
        job_id = uuid.uuid4().hex
        JOBS[job_id] = {'status': 'running', 'message': '正在启动本机模型…'}
        threading.Thread(target=run_job, args=(job_id, image), daemon=True).start()
        self.respond(202, {'id': job_id})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5174)
    parser.add_argument('--input', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path)
    args = parser.parse_args()
    if args.input:
        if not args.output:
            parser.error('--input requires --output')
        import cv2
        output, metrics = restore(decode(args.input.read_bytes()), lambda value: print(value, flush=True))
        if not cv2.imwrite(str(args.output), output):
            raise RuntimeError('Could not write output')
        args.output.with_suffix('.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
        print(json.dumps(metrics), flush=True)
    else:
        print(f'AI lab: http://127.0.0.1:{args.port}/', flush=True)
        ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
