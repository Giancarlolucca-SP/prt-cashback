/**
 * Formats a Date object to Brazilian format: "DD/MM/YYYY HH:mm"
 */
function formatDateBR(date) {
  const d = new Date(date);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/**
 * Returns current date/time in São Paulo timezone.
 */
function nowBR() {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });
}

module.exports = { formatDateBR, nowBR };
