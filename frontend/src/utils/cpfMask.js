/**
 * Applies CPF mask as the user types.
 * "12345678900" → "123.456.789-00"
 */
export function applyCpfMask(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Strips CPF mask, returning only digits.
 * "123.456.789-00" → "12345678900"
 */
export function stripCpf(value) {
  return String(value).replace(/\D/g, '');
}
