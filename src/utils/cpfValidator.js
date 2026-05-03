/**
 * Strips CPF formatting, keeping only digits.
 * Accepts: "529.982.247-25" or "52998224725"
 */
function stripCpf(cpf) {
  return String(cpf).replace(/[^\d]/g, '');
}

/**
 * Validates a Brazilian CPF number.
 * Returns true if valid, false otherwise.
 */
function isValidCpf(cpf) {
  const digits = stripCpf(cpf);

  if (digits.length !== 11) return false;

  // Reject known invalid sequences (all same digits)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = sum % 11;
  const firstCheck = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[9]) !== firstCheck) return false;

  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  remainder = sum % 11;
  const secondCheck = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[10]) !== secondCheck) return false;

  return true;
}

/**
 * Formats a raw CPF string into "XXX.XXX.XXX-XX".
 */
function formatCpf(cpf) {
  const digits = stripCpf(cpf);
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

/**
 * Masks a CPF for display: "123.XXX.XXX-00"
 * Shows first 3 digits and last 2, hides middle 6.
 */
function maskCpf(cpf) {
  const digits = stripCpf(cpf);
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.XXX.XXX-${digits.slice(9)}`;
}

/**
 * Masks a customer name for display: "João S."
 * Shows first name + first letter of last name with period.
 */
function maskName(name) {
  if (!name || typeof name !== 'string') return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

module.exports = { isValidCpf, stripCpf, formatCpf, maskCpf, maskName };
