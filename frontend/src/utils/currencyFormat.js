/**
 * Formats a number as Brazilian Real.
 * 25.5 → "R$ 25,50"
 */
export function formatBRL(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Formats a date string to Brazilian format.
 * "2026-04-15T10:30:00Z" → "15/04/2026 07:30"
 */
export function formatDateBR(dateString) {
  return new Date(dateString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}
