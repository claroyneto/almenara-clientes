// Normaliza un nombre de cliente para compararlo de forma determinística:
// minúsculas, sin tildes, sin espacios de más. Mismo criterio que ya usa
// normalizar() en Almenara_Registro/motor/src/dominio/matchVoz.js — nunca
// se compara por "parecido" (fuzzy): solo coincidencia exacta normalizada,
// para no bloquear clientes distintos con nombres similares (spec §5).
export function normalizarNombre(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
