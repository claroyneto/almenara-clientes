// La señal de "hace cuánto no se toca este cliente" -- compartida entre el
// tablero (app.js) y la ficha (cliente.js) para que los dos lean el mismo
// umbral. Nunca se usa en descartado (a un trato ya cerrado no tiene
// sentido advertirle a nadie que se está enfriando) -- eso lo decide quien
// llama, no este módulo.
export function diasDesdeActividad(fechaIso) {
  const ms = Date.now() - new Date(fechaIso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function estadoBrasa(dias) {
  if (dias <= 6) return 'brasa';
  if (dias <= 20) return 'tibio';
  return 'frio';
}

export function textoRecencia(dias) {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 14) return 'hace 1 semana';
  if (dias < 30) return `hace ${Math.floor(dias / 7)} semanas`;
  if (dias < 60) return 'hace 1 mes';
  return `hace ${Math.floor(dias / 30)} meses`;
}
