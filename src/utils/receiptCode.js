const { randomBytes } = require('crypto');

/**
 * Generates a unique, URL-safe receipt code.
 * Example: "TXN-A3F9B2C1"
 */
function generateReceiptCode(prefix = 'TXN') {
  const hex = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${hex}`;
}

module.exports = { generateReceiptCode };
