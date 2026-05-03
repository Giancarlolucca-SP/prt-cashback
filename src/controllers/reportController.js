const reportService = require('../services/reportService');

const VALID_TYPES = ['TRANSACTIONS', 'REDEMPTIONS', 'CUSTOMERS', 'SUMMARY'];

const TYPE_SLUG = {
  TRANSACTIONS: 'transacoes',
  REDEMPTIONS:  'resgates',
  CUSTOMERS:    'clientes',
  SUMMARY:      'resumo',
};

function validateParams(req, res) {
  const { type, startDate, endDate } = req.query;

  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({
      erro: `Parâmetro "type" inválido. Use: ${VALID_TYPES.join(', ')}`,
    });
    return null;
  }

  return { type, startDate, endDate };
}

async function preview(req, res, next) {
  try {
    const params = validateParams(req, res);
    if (!params) return;

    const data = await reportService.getData(
      params.type,
      params.startDate,
      params.endDate,
      req.operator.establishmentId
    );

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function exportPdf(req, res, next) {
  try {
    const params = validateParams(req, res);
    if (!params) return;

    console.log('[PDF] Gerando PDF tipo:', params.type);

    const data = await reportService.getData(
      params.type,
      params.startDate,
      params.endDate,
      req.operator.establishmentId
    );

    const recordCount = data?.rows?.length ?? data?.topCustomers?.length ?? 0;
    console.log('[PDF] Dados:', recordCount, 'registros');

    const buffer = await reportService.generatePDF(data);
    console.log('[PDF] Buffer gerado:', buffer.length, 'bytes');

    const filename = `relatorio-${TYPE_SLUG[params.type] ?? params.type.toLowerCase()}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[PDF] Erro ao gerar PDF:', err.message);
    console.error('[PDF] Stack:', err.stack);
    next(err);
  }
}

async function exportExcel(req, res, next) {
  try {
    const params = validateParams(req, res);
    if (!params) return;

    const data   = await reportService.getData(
      params.type,
      params.startDate,
      params.endDate,
      req.operator.establishmentId
    );
    const buffer = await reportService.generateExcel(data);

    const filename = `relatorio-${TYPE_SLUG[params.type] ?? params.type.toLowerCase()}-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = { preview, exportPdf, exportExcel };
