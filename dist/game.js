const probe = document.createElement('canvas');
let context = null;
try { context = probe.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' }); } catch { /* Canvas fallback bên dưới luôn khả dụng. */ }
if (context) {
  window.__footballWebGLContext = { canvas: probe, context };
  import('./game-webgl.js').catch(() => import('./game-canvas.js'));
} else {
  import('./game-canvas.js');
}
