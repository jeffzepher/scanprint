# Third-party libraries

OpenCV.js: official 4.x self-contained build, https://docs.opencv.org/4.x/opencv.js (retrieved 2026-10-18). Apache 2.0; see opencv-LICENSE. WASM is embedded; no CDN at runtime. The URL is moving; downloaded bytes are pinned in this repository.

jscanify v1.4.0: https://github.com/puffinsoft/jscanify/tree/v1.4.0 , MIT; see jscanify-LICENSE. Local modification releases temporary contour Mat handles during area comparison.

OpenCV edge detection and quadrilateral contour scoring is primary; jscanify is a secondary candidate. Both run in a classic Web Worker. Detection can fail on low contrast, clipped pages, irregular paper or severe shadows.

processing-core.js uses local background estimation, illumination normalization and adaptive thresholding. It is not an AI restoration model: no true curved-page unwarping or deblurring is implemented.
