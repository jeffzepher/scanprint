"""DocDiff native-resolution region test, based on the author's inference notebook.

Upstream MIT: https://github.com/Royalvice/DocDiff
Uses pretrained deblurring CP + HRR, 100-step linear deterministic DDIM sampling.
CPU float32; seed fixed for reproducible comparisons, no OCR/font replacement.
"""
import hashlib
import pathlib
import sys
import time

MODEL_DIR = pathlib.Path(__file__).resolve().parent.parent / '.local-qa/docdiff'
HASHES = {'init.pth': '2a1a68010683e9b692034bafb572ec1c476e47c6bd1753d0a086f95e01790fbc',
          'denoiser.pth': 'a97ef81372b20e733a5b52fdb6ec3a338ec045e372846c01798e77736581d983'}
NETWORK = None


def ready():
    return all((MODEL_DIR/'checksave'/name).is_file() for name in HASHES) and (MODEL_DIR/'model/DocDiff.py').is_file()


def load_model():
    global NETWORK
    if NETWORK is not None:
        return NETWORK
    import torch
    sys.path.insert(0, str(MODEL_DIR))
    from model.DocDiff import DocDiff
    torch.set_num_threads(4)
    model = DocDiff(input_channels=6, output_channels=3, n_channels=32,
                    ch_mults=[1, 2, 3, 4], n_blocks=1)
    for name, module in [('init.pth', model.init_predictor), ('denoiser.pth', model.denoiser)]:
        path = MODEL_DIR/'checksave'/name
        if hashlib.sha256(path.read_bytes()).hexdigest() != HASHES[name]:
            raise ValueError('DocDiff 权重校验失败：' + name)
        module.load_state_dict(torch.load(path, map_location='cpu', weights_only=True))
    NETWORK = model.eval()
    return NETWORK


def restore(image, progress=lambda message: None):
    import cv2
    import numpy as np
    import torch
    if max(image.shape[:2]) > 384:
        raise ValueError('当前只测试细节区域，请先截取不超过 384 × 384 像素的区域。')
    progress('正在校验并加载 DocDiff（DocRes 已排除）…')
    model = load_model()
    h, w = image.shape[:2]
    # RGB, reflect padding, no resize; same checkpoint configuration as upstream.
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    padded = cv2.copyMakeBorder(rgb, 0, (-h) % 8, 0, (-w) % 8, cv2.BORDER_REFLECT_101)
    tensor = torch.from_numpy(padded.transpose(2, 0, 1).copy()).float().unsqueeze(0)/255
    betas = torch.linspace(1e-5, .2, 100)
    gammas = torch.cumprod(1-betas, dim=0)
    sqrt_g = torch.sqrt(gammas)
    sqrt_one_minus_g = torch.sqrt(1-gammas)
    # Independent generator keeps samples reproducible regardless of other jobs.
    generator = torch.Generator().manual_seed(20261019)
    x = torch.randn(tensor.shape, generator=generator)
    start = time.perf_counter()
    with torch.inference_mode():
        coarse = model.init_predictor(tensor, 0)
        for step in reversed(range(100)):
            if step % 10 == 9 or step == 0:
                progress(f'DocDiff 细节恢复 {100-step}/100 步 · 本机 CPU')
            t = torch.full((1,), step, dtype=torch.long)
            original = model.denoiser(torch.cat((x, coarse), dim=1), t)
            if step:
                eps = (x - sqrt_g[step]*original)/sqrt_one_minus_g[step]
                x = sqrt_g[step-1]*original + sqrt_one_minus_g[step-1]*eps
            else:
                x = original
        result = (x+coarse).clamp(0, 1)[0].permute(1, 2, 0).numpy()[:h, :w]
    output = cv2.cvtColor(np.rint(result*255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    return output, {'width': w, 'height': h, 'seconds': round(time.perf_counter()-start, 2),
                    'task': 'DocDiff pretrained deblurring CP+HRR', 'device': 'CPU float32',
                    'steps': 100, 'seed': 20261019, 'checkpoint_sha256': HASHES,
                    'upstream_commit': 'f422a3af10657eeabeca90f2e862d88c72725845'}
