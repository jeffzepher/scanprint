# Doxa runtime snapshot

Upstream: https://github.com/brandonmpetty/Doxa

Runtime obtained from the author's WebAssembly demo on 2026-10-19:

- https://brandonmpetty.github.io/Doxa/WebAssembly/doxaWasm.js
- https://brandonmpetty.github.io/Doxa/WebAssembly/doxaWasm.wasm

Unmodified runtime SHA-256:

- JS: `ea2e1184132f9ec60afa0dbdc0556ce27d32e2cf01e08e4363c787dace03ea6e`
- WASM: `c5d09717da758b34b32a58b097c0bdccd32159a96690cc05f7941f2d49a13055`

License: CC0-1.0, see LICENSE. JavaScript + WASM total: 163,905 bytes.
No CDN is used at runtime. Both assets are included in the offline cache.

Our adapter calls the compiled Sauvola implementation directly, uses overlapping
tiles to bound temporary memory, and frees all buffers and Embind objects.

The mixed text/picture workflow is informed by the documented design of
ScanTailor Advanced (https://github.com/4lex4/scantailor-advanced). Its GPL source
has not been copied; the segmentation and blending here are independently
implemented heuristics, not a port of ScanTailor's segmentation algorithm.
