// Escapa HTML antes de interpolar en innerHTML — evita XSS almacenado si un
// nombre de cliente o el texto de una nota contiene <, >, ", & o '.
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
