const { formatBRL } = require('../utils/currencyFormatter');
const { maskCpf, maskName } = require('../utils/cpfValidator');
const { formatDateBR } = require('../utils/dateFormatter');

const STATION_NAME = process.env.STATION_NAME || 'POSTO XYZ';
const LINE = '='.repeat(32);
const DASH = '-'.repeat(32);

/**
 * Generates a plain-text ESC/POS-ready receipt for cashback earning.
 */
function generateEarnReceipt({ customerName, cpf, amount, cashbackPercent, cashbackValue, newBalance, receiptCode, date }) {
  const lines = [
    centerText(`${STATION_NAME} — CASHBACK`),
    LINE,
    'Via: CLIENTE',
    DASH,
    `Cliente: ${maskName(customerName)}`,
    `CPF: ${maskCpf(cpf)}`,
    `Data: ${formatDateBR(date)}`,
    `Código: ${receiptCode}`,
    DASH,
    `Abastecimento: ${formatBRL(amount)}`,
    `Cashback (${cashbackPercent}%): ${formatBRL(cashbackValue)}`,
    `Saldo atual: ${formatBRL(newBalance)}`,
    LINE,
    centerText('Obrigado pela preferencia!'),
  ];

  return lines.join('\n');
}

/**
 * Generates a plain-text ESC/POS-ready receipt for cashback redemption.
 */
function generateRedeemReceipt({ customerName, cpf, amountUsed, newBalance, receiptCode, date }) {
  const lines = [
    centerText(`${STATION_NAME} — CASHBACK`),
    LINE,
    'Via: CLIENTE',
    DASH,
    `Cliente: ${maskName(customerName)}`,
    `CPF: ${maskCpf(cpf)}`,
    `Data: ${formatDateBR(date)}`,
    `Código: ${receiptCode}`,
    DASH,
    `💰 DESCONTO: ${formatBRL(amountUsed)}`,
    `Saldo restante: ${formatBRL(newBalance)}`,
    'Apresente ao operador',
    LINE,
  ];

  return lines.join('\n');
}

function centerText(text, width = 32) {
  if (text.length >= width) return text;
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

module.exports = { generateEarnReceipt, generateRedeemReceipt };
