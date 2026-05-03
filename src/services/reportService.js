const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { formatCpf, maskCpf } = require('../utils/cpfValidator');
const { formatBRL } = require('../utils/currencyFormatter');

const prisma = new PrismaClient();

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDateBR(str) {
  if (!str) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d;
}

function fmtDateBR(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function fmtDateTimeBR(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function dateRangeLabel(startDate, endDate) {
  if (!startDate && !endDate) return 'Todos os períodos';
  if (startDate && endDate) return `${fmtDateBR(startDate)} a ${fmtDateBR(endDate)}`;
  if (startDate) return `A partir de ${fmtDateBR(startDate)}`;
  return `Até ${fmtDateBR(endDate)}`;
}

// ── LGPD masking ──────────────────────────────────────────────────────────────

function maskName(name) {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0] + '***';
  return `${parts[0]} ${'*'.repeat(parts.slice(1).join(' ').length)}`;
}

function maskPhone(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '***';
  return `(${digits.slice(0, 2)}) XXXXX-${digits.slice(-4)}`;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getData(type, rawStart, rawEnd, establishmentId) {
  const startDate = parseDateBR(rawStart);
  const endDate   = rawEnd ? (() => {
    const d = parseDateBR(rawEnd);
    if (d) d.setUTCHours(23, 59, 59, 999);
    return d;
  })() : null;

  const dateFilter = {};
  if (startDate) dateFilter.gte = startDate;
  if (endDate)   dateFilter.lte = endDate;
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  const establishment = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: { name: true },
  });

  const meta = {
    establishmentName: establishment?.name || '',
    dateRange: dateRangeLabel(startDate, endDate),
    generatedAt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  };

  switch (type) {
    case 'TRANSACTIONS': {
      const rows = await prisma.transaction.findMany({
        where: {
          establishmentId,
          ...(hasDateFilter ? { createdAt: dateFilter } : {}),
        },
        include: {
          customer: { select: { name: true, cpf: true } },
          operator: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const totalAmount   = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
      const totalCashback = rows.reduce((s, r) => s + parseFloat(r.cashbackValue), 0);

      return {
        type,
        meta,
        rows: rows.map((r) => ({
          date:           r.createdAt,
          customerName:   r.customer.name,
          cpf:            formatCpf(r.customer.cpf),
          amount:         parseFloat(r.amount),
          cashbackPercent: parseFloat(r.cashbackPercent),
          cashbackValue:  parseFloat(r.cashbackValue),
          operator:       r.operator.name,
        })),
        totals: { count: rows.length, totalAmount, totalCashback },
      };
    }

    case 'REDEMPTIONS': {
      const rows = await prisma.redemption.findMany({
        where: {
          establishmentId,
          status: 'CONFIRMED',
          ...(hasDateFilter ? { createdAt: dateFilter } : {}),
        },
        include: {
          customer: { select: { name: true, cpf: true } },
          operator: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const totalAmount = rows.reduce((s, r) => s + parseFloat(r.amountUsed), 0);

      return {
        type,
        meta,
        rows: rows.map((r) => ({
          date:         r.createdAt,
          customerName: r.customer.name,
          cpf:          formatCpf(r.customer.cpf),
          amountRedeemed: parseFloat(r.amountUsed),
          operator:     r.operator.name,
        })),
        totals: { count: rows.length, totalAmount },
      };
    }

    case 'CUSTOMERS': {
      // Busca todos os clientes do estabelecimento — o filtro de data se aplica às
      // transações (período de atividade), não ao cadastro do cliente.
      const customers = await prisma.customer.findMany({
        where: { establishmentId },
        include: {
          transactions: {
            where: hasDateFilter ? { createdAt: dateFilter } : undefined,
            select: { amount: true, createdAt: true, status: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { name: 'asc' },
      });

      console.log('[REPORT] Customers found:', customers.length);

      // Quando há filtro de data, exibe apenas quem teve transação no período.
      const active = hasDateFilter
        ? customers.filter((c) => c.transactions.length > 0)
        : customers;

      console.log('[REPORT] Customers active in period:', active.length);

      const safeFloat = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

      const totalBalance = active.reduce((s, c) => s + safeFloat(c.balance), 0);
      const totalSpent   = active.reduce(
        (s, c) => s + c.transactions.reduce((ts, t) => ts + safeFloat(t.amount), 0), 0,
      );

      return {
        type,
        meta,
        rows: active.map((c) => ({
          nameFull:         c.name,
          name:             maskName(c.name),
          cpf:              maskCpf(c.cpf),
          phone:            maskPhone(c.phone),
          balance:          safeFloat(c.balance),
          totalSpent:       c.transactions.reduce((s, t) => s + safeFloat(t.amount), 0),
          lastFuelDate:     c.transactions.length > 0 ? c.transactions[0].createdAt : null,
          transactionCount: c.transactions.length,
        })),
        totals: { count: active.length, totalBalance, totalSpent },
      };
    }

    case 'SUMMARY': {
      const transWhere = {
        establishmentId,
        ...(hasDateFilter ? { createdAt: dateFilter } : {}),
      };

      const [
        totalCustomers,
        newCustomers,
        totalTransactions,
        totalRedemptions,
        earnAgg,
        redeemAgg,
        topRaw,
      ] = await Promise.all([
        prisma.customer.count({ where: { establishmentId } }),
        prisma.customer.count({ where: { establishmentId, ...(hasDateFilter ? { createdAt: dateFilter } : {}) } }),
        prisma.transaction.count({ where: transWhere }),
        prisma.redemption.count({ where: { ...transWhere, status: 'CONFIRMED' } }),
        prisma.transaction.aggregate({ where: transWhere, _sum: { amount: true, cashbackValue: true } }),
        prisma.redemption.aggregate({ where: { ...transWhere, status: 'CONFIRMED' }, _sum: { amountUsed: true } }),
        prisma.transaction.groupBy({
          by: ['customerId'],
          where: transWhere,
          _sum: { amount: true, cashbackValue: true },
          _count: { id: true },
          orderBy: { _sum: { amount: 'desc' } },
          take: 10,
        }),
      ]);

      const customerIds = topRaw.map((t) => t.customerId);
      const customerMap = customerIds.length > 0
        ? Object.fromEntries(
            (await prisma.customer.findMany({
              where: { id: { in: customerIds } },
              select: { id: true, name: true, cpf: true },
            })).map((c) => [c.id, c])
          )
        : {};

      return {
        type,
        meta,
        stats: {
          totalCustomers,
          newCustomers,
          totalTransactions,
          totalRedemptions,
          totalFueled:   parseFloat(earnAgg._sum.amount    || 0),
          totalCashback: parseFloat(earnAgg._sum.cashbackValue || 0),
          totalRedeemed: parseFloat(redeemAgg._sum.amountUsed  || 0),
        },
        topCustomers: topRaw.map((t, i) => ({
          rank:           i + 1,
          name:           customerMap[t.customerId]?.name || 'N/A',
          cpf:            formatCpf(customerMap[t.customerId]?.cpf || ''),
          totalSpent:     parseFloat(t._sum.amount || 0),
          totalCashback:  parseFloat(t._sum.cashbackValue || 0),
          visits:         t._count.id,
        })),
      };
    }

    default:
      throw new Error(`Tipo de relatório inválido: ${type}`);
  }
}

// ── PDF helpers ───────────────────────────────────────────────────────────────

const PDF_MARGIN  = 40;
const PDF_WIDTH   = 595;
const PDF_HEIGHT  = 842;
const ROW_H       = 20;
const HEADER_H    = 85;
const PAGE_BOTTOM = PDF_HEIGHT - PDF_MARGIN;

// Truncate to fit in a column (Helvetica ~7.5pt ≈ 4pt avg char width)
function fit(value, colWidth) {
  const s = value == null ? '—' : String(value);
  const maxChars = Math.floor((colWidth - 8) / 4.2);
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 1) + '…';
}

function drawPdfHeader(doc, title, meta) {
  doc.rect(0, 0, PDF_WIDTH, HEADER_H).fill('#1e3a8a');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text(title, PDF_MARGIN, 18, { lineBreak: false });
  doc.font('Helvetica').fontSize(8);
  if (meta.establishmentName) {
    doc.fillColor('#93c5fd').text(meta.establishmentName, PDF_MARGIN, 42, { lineBreak: false });
  }
  doc.fillColor('#bfdbfe').text(`Período: ${meta.dateRange}`, PDF_MARGIN, 54, { lineBreak: false });
  doc.text(`Gerado em: ${meta.generatedAt}`, PDF_MARGIN, 66, { lineBreak: false });
  doc.fillColor('#1e293b');
}

function drawTableHeader(doc, headers, colWidths, y) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  doc.rect(PDF_MARGIN, y, totalW, ROW_H).fill('#334155');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
  let x = PDF_MARGIN;
  headers.forEach((h, i) => {
    doc.text(h, x + 4, y + 6, { width: colWidths[i] - 6, lineBreak: false });
    x += colWidths[i];
  });
  return y + ROW_H;
}

function drawDataRow(doc, cells, colWidths, y, isAlt) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  if (isAlt) doc.rect(PDF_MARGIN, y, totalW, ROW_H).fill('#f8fafc');
  doc.fillColor('#1e293b').font('Helvetica').fontSize(7.5);
  let x = PDF_MARGIN;
  cells.forEach((cell, i) => {
    doc.text(fit(cell, colWidths[i]), x + 4, y + 6, { width: colWidths[i] - 6, lineBreak: false });
    x += colWidths[i];
  });
  // subtle row separator
  const totalW2 = colWidths.reduce((a, b) => a + b, 0);
  doc.moveTo(PDF_MARGIN, y + ROW_H).lineTo(PDF_MARGIN + totalW2, y + ROW_H)
    .strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  return y + ROW_H;
}

function drawTotalsRow(doc, cells, colWidths, y) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  doc.rect(PDF_MARGIN, y, totalW, ROW_H).fill('#dcfce7');
  doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(7.5);
  let x = PDF_MARGIN;
  cells.forEach((cell, i) => {
    doc.text(fit(cell, colWidths[i]), x + 4, y + 6, { width: colWidths[i] - 6, lineBreak: false });
    x += colWidths[i];
  });
  return y + ROW_H;
}

function drawTable(doc, { headers, colWidths, rows, totalsRow }, startY) {
  let y = drawTableHeader(doc, headers, colWidths, startY);

  rows.forEach((row, idx) => {
    if (y + ROW_H > PAGE_BOTTOM) {
      doc.addPage();
      y = drawTableHeader(doc, headers, colWidths, PDF_MARGIN);
    }
    y = drawDataRow(doc, row, colWidths, y, idx % 2 === 1);
  });

  if (totalsRow) {
    if (y + ROW_H > PAGE_BOTTOM) { doc.addPage(); y = PDF_MARGIN; }
    y = drawTotalsRow(doc, totalsRow, colWidths, y);
  }

  return y;
}

// ── PDF generation ────────────────────────────────────────────────────────────

async function generatePDF(data) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];
    doc.on('data',  (c) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { type, meta } = data;

    if (type === 'TRANSACTIONS') {
      drawPdfHeader(doc, 'Relatório de Transações', meta);
      const headers   = ['Data/Hora', 'Cliente', 'CPF', 'Valor Abast.', 'CB%', 'Cashback', 'Operador'];
      const colWidths = [80, 112, 88, 66, 36, 66, 67];
      const rows = data.rows.map((r) => [
        fmtDateTimeBR(r.date),
        r.customerName,
        r.cpf,
        formatBRL(r.amount),
        `${r.cashbackPercent}%`,
        formatBRL(r.cashbackValue),
        r.operator,
      ]);
      const totalsRow = [
        'TOTAIS',
        `${data.totals.count} transações`,
        '',
        formatBRL(data.totals.totalAmount),
        '',
        formatBRL(data.totals.totalCashback),
        '',
      ];
      drawTable(doc, { headers, colWidths, rows, totalsRow }, HEADER_H + 12);
    }

    else if (type === 'REDEMPTIONS') {
      drawPdfHeader(doc, 'Relatório de Resgates', meta);
      const headers   = ['Data/Hora', 'Cliente', 'CPF', 'Valor Resgatado', 'Operador'];
      const colWidths = [90, 145, 90, 95, 95];
      const rows = data.rows.map((r) => [
        fmtDateTimeBR(r.date),
        r.customerName,
        r.cpf,
        formatBRL(r.amountRedeemed),
        r.operator,
      ]);
      const totalsRow = [
        'TOTAIS',
        `${data.totals.count} resgates`,
        '',
        formatBRL(data.totals.totalAmount),
        '',
      ];
      drawTable(doc, { headers, colWidths, rows, totalsRow }, HEADER_H + 12);
    }

    else if (type === 'CUSTOMERS') {
      drawPdfHeader(doc, 'Relatório de Clientes', meta);

      if (!data.rows || data.rows.length === 0) {
        doc.fillColor('#64748b').font('Helvetica').fontSize(11)
          .text('Nenhum cliente encontrado para o período selecionado.', PDF_MARGIN, HEADER_H + 24);
      } else {
        const headers   = ['Nome', 'CPF', 'Telefone', 'Saldo', 'Total Gasto', 'Último Abast.', 'Trans.'];
        const colWidths = [120, 90, 78, 62, 74, 66, 25];
        const rows = data.rows.map((r) => [
          r.nameFull ?? r.name ?? '—',
          r.cpf      ?? '—',
          r.phone    ?? '—',
          formatBRL(isFinite(r.balance)   ? r.balance   : 0),
          formatBRL(isFinite(r.totalSpent) ? r.totalSpent : 0),
          fmtDateBR(r.lastFuelDate),
          r.transactionCount ?? 0,
        ]);
        const totalsRow = [
          `${data.totals.count} clientes`,
          '',
          '',
          formatBRL(isFinite(data.totals.totalBalance) ? data.totals.totalBalance : 0),
          formatBRL(isFinite(data.totals.totalSpent)   ? data.totals.totalSpent   : 0),
          '',
          '',
        ];
        drawTable(doc, { headers, colWidths, rows, totalsRow }, HEADER_H + 12);
      }
    }

    else if (type === 'SUMMARY') {
      drawPdfHeader(doc, 'Relatório Resumo', meta);

      const { stats, topCustomers } = data;
      let y = HEADER_H + 16;

      // ── Stats grid (2 columns) ──────────────────────────────────────────────
      const statItems = [
        ['Total de clientes',      stats.totalCustomers],
        ['Novos clientes no período', stats.newCustomers],
        ['Transações no período',  stats.totalTransactions],
        ['Resgates no período',    stats.totalRedemptions],
        ['Total abastecido (R$)',  formatBRL(stats.totalFueled)],
        ['Cashback gerado (R$)',   formatBRL(stats.totalCashback)],
        ['Cashback resgatado (R$)', formatBRL(stats.totalRedeemed)],
        ['Saldo em circulação (R$)', formatBRL(stats.totalCashback - stats.totalRedeemed)],
      ];

      const BOX_W = 248;
      const BOX_H = 38;
      const BOX_GAP = 19;

      statItems.forEach((item, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const bx = PDF_MARGIN + col * (BOX_W + BOX_GAP);
        const by = y + row * (BOX_H + 6);

        doc.rect(bx, by, BOX_W, BOX_H).fill(col === 0 ? '#f0f9ff' : '#f0fdf4').stroke('#e2e8f0');
        doc.fillColor('#64748b').font('Helvetica').fontSize(7.5)
          .text(item[0], bx + 8, by + 8, { lineBreak: false });
        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(13)
          .text(String(item[1]), bx + 8, by + 18, { lineBreak: false });
      });

      y += Math.ceil(statItems.length / 2) * (BOX_H + 6) + 16;

      // ── Top customers table ─────────────────────────────────────────────────
      if (topCustomers.length > 0) {
        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10)
          .text('Top 10 Clientes por Volume no Período', PDF_MARGIN, y);
        y += 18;

        const headers   = ['#', 'Nome', 'CPF', 'Total Abast.', 'Cashback', 'Visitas'];
        const colWidths = [22, 160, 100, 85, 85, 63];
        const rows = topCustomers.map((c) => [
          c.rank,
          c.name,
          c.cpf,
          formatBRL(c.totalSpent),
          formatBRL(c.totalCashback),
          c.visits,
        ]);
        drawTable(doc, { headers, colWidths, rows, totalsRow: null }, y);
      }
    }

    doc.end();
  });
}

// ── Excel generation ──────────────────────────────────────────────────────────

const EXCEL_HEADER_STYLE = {
  font:      { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
  fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: {
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  },
};

const EXCEL_TOTALS_STYLE = {
  font:      { bold: true, color: { argb: 'FF15803D' }, size: 10 },
  fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } },
  alignment: { vertical: 'middle' },
};

const EXCEL_ALT_FILL = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' },
};

function styleHeaderRow(row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font      = EXCEL_HEADER_STYLE.font;
    cell.fill      = EXCEL_HEADER_STYLE.fill;
    cell.alignment = EXCEL_HEADER_STYLE.alignment;
    cell.border    = EXCEL_HEADER_STYLE.border;
  });
}

function styleTotalsRow(row) {
  row.height = 20;
  row.eachCell((cell) => {
    cell.font   = EXCEL_TOTALS_STYLE.font;
    cell.fill   = EXCEL_TOTALS_STYLE.fill;
    cell.alignment = EXCEL_TOTALS_STYLE.alignment;
  });
}

function styleDataRow(row, isAlt) {
  row.height = 18;
  if (isAlt) {
    row.eachCell((cell) => { cell.fill = EXCEL_ALT_FILL; });
  }
}

function autoFitColumns(ws, minWidth = 10, maxWidth = 45) {
  ws.columns.forEach((col) => {
    let max = minWidth;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, maxWidth);
  });
}

function addInfoSheet(wb, meta, type) {
  const ws = wb.addWorksheet('Informações');
  ws.columns = [{ width: 28 }, { width: 45 }];

  const TYPE_LABELS = {
    TRANSACTIONS: 'Relatório de Transações',
    REDEMPTIONS:  'Relatório de Resgates',
    CUSTOMERS:    'Relatório de Clientes',
    SUMMARY:      'Relatório Resumo',
  };

  const rows = [
    ['Relatório',       TYPE_LABELS[type] || type],
    ['Estabelecimento', meta.establishmentName],
    ['Período',         meta.dateRange],
    ['Gerado em',       meta.generatedAt],
  ];

  rows.forEach(([label, value]) => {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });
}

async function generateExcel(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'PRT Cashback';
  wb.created  = new Date();
  wb.modified = new Date();

  addInfoSheet(wb, data.meta, data.type);

  const { type } = data;

  if (type === 'TRANSACTIONS') {
    const ws = wb.addWorksheet('Transações');
    ws.columns = [
      { header: 'Data/Hora',      key: 'date',            width: 18 },
      { header: 'Cliente',        key: 'customerName',    width: 28 },
      { header: 'CPF',            key: 'cpf',             width: 16 },
      { header: 'Valor Abast. (R$)', key: 'amount',       width: 18 },
      { header: 'Cashback %',     key: 'cashbackPercent', width: 12 },
      { header: 'Cashback (R$)',  key: 'cashbackValue',   width: 16 },
      { header: 'Operador',       key: 'operator',        width: 22 },
    ];

    styleHeaderRow(ws.getRow(1));

    data.rows.forEach((r, idx) => {
      const row = ws.addRow({
        date:           fmtDateTimeBR(r.date),
        customerName:   r.customerName,
        cpf:            r.cpf,
        amount:         r.amount,
        cashbackPercent: r.cashbackPercent,
        cashbackValue:  r.cashbackValue,
        operator:       r.operator,
      });
      styleDataRow(row, idx % 2 === 1);
      row.getCell('amount').numFmt        = '"R$"#,##0.00';
      row.getCell('cashbackValue').numFmt = '"R$"#,##0.00';
      row.getCell('cashbackPercent').numFmt = '0.00"%"';
    });

    const totalsRow = ws.addRow({
      date:           'TOTAIS',
      customerName:   `${data.totals.count} transações`,
      cpf:            '',
      amount:         data.totals.totalAmount,
      cashbackPercent: '',
      cashbackValue:  data.totals.totalCashback,
      operator:       '',
    });
    styleTotalsRow(totalsRow);
    totalsRow.getCell('amount').numFmt        = '"R$"#,##0.00';
    totalsRow.getCell('cashbackValue').numFmt = '"R$"#,##0.00';
  }

  else if (type === 'REDEMPTIONS') {
    const ws = wb.addWorksheet('Resgates');
    ws.columns = [
      { header: 'Data/Hora',          key: 'date',          width: 18 },
      { header: 'Cliente',            key: 'customerName',  width: 28 },
      { header: 'CPF',                key: 'cpf',           width: 16 },
      { header: 'Valor Resgatado (R$)', key: 'amountRedeemed', width: 20 },
      { header: 'Operador',           key: 'operator',      width: 22 },
    ];

    styleHeaderRow(ws.getRow(1));

    data.rows.forEach((r, idx) => {
      const row = ws.addRow({
        date:          fmtDateTimeBR(r.date),
        customerName:  r.customerName,
        cpf:           r.cpf,
        amountRedeemed: r.amountRedeemed,
        operator:      r.operator,
      });
      styleDataRow(row, idx % 2 === 1);
      row.getCell('amountRedeemed').numFmt = '"R$"#,##0.00';
    });

    const totalsRow = ws.addRow({
      date:          'TOTAIS',
      customerName:  `${data.totals.count} resgates`,
      cpf:           '',
      amountRedeemed: data.totals.totalAmount,
      operator:      '',
    });
    styleTotalsRow(totalsRow);
    totalsRow.getCell('amountRedeemed').numFmt = '"R$"#,##0.00';
  }

  else if (type === 'CUSTOMERS') {
    const ws = wb.addWorksheet('Clientes');
    ws.columns = [
      { header: 'Nome',                key: 'name',             width: 28 },
      { header: 'CPF',                 key: 'cpf',              width: 16 },
      { header: 'Telefone',            key: 'phone',            width: 16 },
      { header: 'Saldo (R$)',          key: 'balance',          width: 16 },
      { header: 'Total Gasto (R$)',    key: 'totalSpent',       width: 18 },
      { header: 'Último Abast.',       key: 'lastFuelDate',     width: 16 },
      { header: 'Nº Transações',       key: 'transactionCount', width: 14 },
    ];

    styleHeaderRow(ws.getRow(1));

    data.rows.forEach((r, idx) => {
      const row = ws.addRow({
        name:             r.nameFull ?? r.name,
        cpf:              r.cpf,
        phone:            r.phone,
        balance:          r.balance,
        totalSpent:       r.totalSpent,
        lastFuelDate:     fmtDateBR(r.lastFuelDate),
        transactionCount: r.transactionCount,
      });
      styleDataRow(row, idx % 2 === 1);
      row.getCell('balance').numFmt    = '"R$"#,##0.00';
      row.getCell('totalSpent').numFmt = '"R$"#,##0.00';
    });

    const totalsRow = ws.addRow({
      name:             `${data.totals.count} clientes`,
      cpf:              '',
      phone:            '',
      balance:          data.totals.totalBalance,
      totalSpent:       data.totals.totalSpent,
      lastFuelDate:     '',
      transactionCount: '',
    });
    styleTotalsRow(totalsRow);
    totalsRow.getCell('balance').numFmt    = '"R$"#,##0.00';
    totalsRow.getCell('totalSpent').numFmt = '"R$"#,##0.00';
  }

  else if (type === 'SUMMARY') {
    // Sheet 1: Stats
    const wsStats = wb.addWorksheet('Resumo');
    wsStats.columns = [{ width: 32 }, { width: 20 }];

    const statsHeader = wsStats.addRow(['Indicador', 'Valor']);
    styleHeaderRow(statsHeader);

    const { stats } = data;
    const statItems = [
      ['Total de clientes (geral)',       stats.totalCustomers],
      ['Novos clientes no período',       stats.newCustomers],
      ['Transações no período',           stats.totalTransactions],
      ['Resgates no período',             stats.totalRedemptions],
      ['Total abastecido (R$)',           stats.totalFueled],
      ['Cashback gerado (R$)',            stats.totalCashback],
      ['Cashback resgatado (R$)',         stats.totalRedeemed],
      ['Saldo em circulação (R$)',        stats.totalCashback - stats.totalRedeemed],
    ];

    statItems.forEach(([label, value], idx) => {
      const row = wsStats.addRow([label, value]);
      styleDataRow(row, idx % 2 === 1);
      if (String(label).includes('R$')) {
        row.getCell(2).numFmt = '"R$"#,##0.00';
      }
    });

    // Sheet 2: Top Customers
    if (data.topCustomers.length > 0) {
      const wsTop = wb.addWorksheet('Top Clientes');
      wsTop.columns = [
        { header: '#',              key: 'rank',          width: 6  },
        { header: 'Nome',           key: 'name',          width: 28 },
        { header: 'CPF',            key: 'cpf',           width: 16 },
        { header: 'Total Abast.',   key: 'totalSpent',    width: 18 },
        { header: 'Cashback',       key: 'totalCashback', width: 16 },
        { header: 'Visitas',        key: 'visits',        width: 10 },
      ];
      styleHeaderRow(wsTop.getRow(1));
      data.topCustomers.forEach((c, idx) => {
        const row = wsTop.addRow(c);
        styleDataRow(row, idx % 2 === 1);
        row.getCell('totalSpent').numFmt    = '"R$"#,##0.00';
        row.getCell('totalCashback').numFmt = '"R$"#,##0.00';
      });
      autoFitColumns(wsTop);
    }
  }

  return wb.xlsx.writeBuffer();
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = { getData, generatePDF, generateExcel };
