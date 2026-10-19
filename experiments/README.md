# AI 文档增强试验页

独立于 v24，不改变扫描、历史或 PDF 导出。没有 OCR，也没有字体替换。

## 当前结论

DocRes 外观修复没有显示出优于 v24 的稳定收益，已从候选方案排除。其补充整页去模糊试验已停止，不作为上线依据。

DocDiff 官方去模糊预训练权重在教材第 22 页的两块 192 × 192 原尺寸区域上测试：正文 8.83 秒，插图 9.05 秒（本机 CPU、4 线程，不含模型加载）。观察到重影、背景残留、小字及线条变形，尚未通过对比，因此也不接入扫描主流程。不能把这些局部结果推广成它在所有文档上的表现。

## 本机运行

在项目目录执行 `python experiments/server.py`，访问 http://127.0.0.1:5174/ 。服务仅监听本机，不调用第三方服务。模型在 CPU float32 下运行，逐张处理。只有本机提供教材样图；这些照片和处理结果不发布到 GitHub。

依赖 Python、PyTorch、OpenCV、Pillow、NumPy。当前开发机已安装。将 [DocDiff 官方仓库](https://github.com/Royalvice/DocDiff) 放到 `.local-qa/docdiff/`，保留 `model/`、`src/`、`checksave/`。本次采用提交 `f422a3af10657eeabeca90f2e862d88c72725845`，MIT 许可。

CPU 兼容调整：官方 `model/DocDiff.py` 的 UNet.forward 默认参数 `torch.tensor([0]).cuda()` 改为 `torch.tensor([0])`，避免在 CPU 版 PyTorch 导入时报错。没有改变网络权重。

校验权重 SHA-256：

- `checksave/init.pth`: `2a1a68010683e9b692034bafb572ec1c476e47c6bd1753d0a086f95e01790fbc`
- `checksave/denoiser.pth`: `a97ef81372b20e733a5b52fdb6ec3a338ec045e372846c01798e77736581d983`

## 对比方法

先导入已裁剪的原图，生成同尺寸 v24 对照。在 100% / 200% 下定位文字，点击“截取左侧中心细节”，再测试 DocDiff。左右同步滚动，也可以导入同尺寸 AI 图片。重新导入或点击样图可恢复整页。

DocDiff 使用官方配置的 CP+HRR、100 步线性调度和确定性 DDIM 更新；固定初始噪声种子 20261019，保持原尺寸，反射填充至 8 的倍数，不缩放、不分块重拼。当前只接受最大 384 × 384 的区域，默认截取 192 × 192，避免把尚未通过的模型用于整页。区域上下文与整页不同，结论仅适用于当前测试条件。

命令行：`python experiments/server.py --input region.png --output result.png`。

GitHub Pages 上的 `/experiments/` 仅支持导入图片比较，不运行 Python，不提供教材照片。浏览器模型部署与 iPhone 适配尚未开始；只有模型先通过图像对比才继续。实验结果保存在 `.local-qa/ai-lab/`，不要将该目录作为公开网站根目录。
