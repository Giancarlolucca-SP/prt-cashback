/**
 * Formats a numeric value as Brazilian Real (BRL).
 * Example: 25.5 → "R$ 25,50"
 */
function formatBRL(value) {
  const number = parseFloat(value);
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Parses a BRL string back to a float.
 * Example: "R$ 25,50" → 25.5
 */
function parseBRL(value) {
  if (typeof value === 'number') return value;
  return parseFloat(
    String(value)
      .replace(/R\$\s?/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim()
  );
}

module.exports = { formatBRL, parseBRL };
