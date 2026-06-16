const { formatBRL } = require('../utils/currencyFormatter');
const { maskCpf, maskName, formatCpf } = require('../utils/cpfValidator');
const { formatDateBR } = require('../utils/dateFormatter');

function formatDateTimeBR(date) {
  try {
    return new Date(date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return formatDateBR(date);
  }
}

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
    `DESCONTO: ${formatBRL(amountUsed)}`,
    `Saldo restante: ${formatBRL(newBalance)}`,
    'Apresente ao operador',
    LINE,
  ];

  return lines.join('\n');
}

/**
 * Non-fiscal control receipt for the Painel da Pista (internal cashback only).
 * Clearly marked as NOT a fiscal document.
 *
 * @param {object} p
 * @param {'acumulo'|'resgate'} p.type
 * @param {string} p.controlNumber  unique control code (the receiptCode)
 * @param {Date}   p.date
 * @param {string} p.frentista      operator/frentista name
 * @param {string} p.customerName
 * @param {string} p.cpf
 * @param {number} p.value          accrued cashback OR redeemed amount
 * @param {number} p.balance        remaining balance
 * @param {string} [p.reference]    reference abastecimento (value/bomba)
 */
function generateComprovante({ type, controlNumber, date, frentista, customerName, cpf, value, balance, reference }) {
  const tipo = type === 'resgate' ? 'RESGATE' : 'ACÚMULO';
  const lines = [
    centerText(STATION_NAME),
    centerText('COMPROVANTE DE CASHBACK'),
    centerText('NAO E DOCUMENTO FISCAL'),
    LINE,
    `Controle: ${controlNumber}`,
    `Data/hora: ${formatDateTimeBR(date)}`,
    `Frentista: ${frentista || '-'}`,
    DASH,
    `Cliente: ${customerName || '-'}`,
    `CPF: ${formatCpf(cpf)}`,
    `Tipo: ${tipo}`,
    `Valor: ${formatBRL(value)}`,
    `Saldo restante: ${formatBRL(balance)}`,
    ...(reference ? [`Ref. abastec.: ${reference}`] : []),
    LINE,
    centerText('Documento de controle interno'),
    centerText('Cashback PostoCash'),
  ];
  return lines.join('\n');
}

function centerText(text, width = 32) {
  if (text.length >= width) return text;
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text;
}

module.exports = { generateEarnReceipt, generateRedeemReceipt, generateComprovante };
