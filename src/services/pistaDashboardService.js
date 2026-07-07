/**
 * Painel da Pista — frentista dashboard. Reads from Abastecimento (today, in the
 * establishment timezone), resolves the frentista via the card map -> Attendant,
 * and returns per-frentista metrics + the data for the pie chart by atendente.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const TZ = 'America/Sao_Paulo';

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function f(v) { return parseFloat(v) || 0; }

// "Today" in the establishment timezone (BRT, UTC-3, no DST) as absolute instants.
function todayRange() {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return { date, start: new Date(`${date}T00:00:00-03:00`), end: new Date(`${date}T23:59:59.999-03:00`) };
}

// Local (establishment TZ) calendar date for a fueling instant, as 'YYYY-MM-DD'.
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
function localDay(d) { return dayFmt.format(d); }

async function dashboard(operator, query = {}) {
  const establishmentId = operator.establishmentId;
  const { date, start, end } = todayRange();
  const historyDays = Math.min(Math.max(parseInt(query.historyDays, 10) || 7, 1), 30);
  const historyStart = new Date(start);
  historyStart.setDate(historyStart.getDate() - (historyDays - 1));

  const [rows, historyRows, cardMaps] = await Promise.all([
    prisma.abastecimento.findMany({
      where:  { establishmentId, fuelingDateTime: { gte: start, lte: end } },
      orderBy: { fuelingDateTime: 'desc' },
      select: { identfidCode: true, volumeLiters: true, totalValue: true, fuelName: true, isAditivada: true, fuelingDateTime: true },
    }),
    prisma.abastecimento.findMany({
      where:  { establishmentId, fuelingDateTime: { gte: historyStart, lte: end } },
      select: { identfidCode: true, volumeLiters: true, fuelName: true, isAditivada: true, fuelingDateTime: true },
    }),
    prisma.pistaCardMap.findMany({ where: { establishmentId }, include: { attendant: { select: { id: true, name: true, photoUrl: true } } } }),
  ]);

  const cardToAtt = new Map(cardMaps.map((c) => [c.identfidCode, c.attendant]));

  const groups = new Map();
  function bucket(key, nome, photoUrl, identificado, codigo) {
    if (!groups.has(key)) {
      groups.set(key, { key, attendantId: identificado ? key : null, nome, photoUrl: photoUrl || null, identificado, codigo: codigo || null,
        litrosTotal: 0, litrosGasolinaComum: 0, litrosAditivada: 0, valorTotal: 0, qtd: 0, ultimoAbastecimento: null });
    }
    return groups.get(key);
  }

  for (const r of rows) {
    const att = r.identfidCode ? cardToAtt.get(r.identfidCode) : null;
    let g;
    if (att) g = bucket(att.id, att.name, att.photoUrl, true, null);
    else if (r.identfidCode) g = bucket(`code:${r.identfidCode}`, `Não identificado (código ${r.identfidCode})`, null, false, r.identfidCode);
    else g = bucket('sem-identificador', 'Sem identificador', null, false, null);

    const liters = f(r.volumeLiters);
    g.litrosTotal += liters;
    g.valorTotal  += f(r.totalValue);
    g.qtd += 1;
    if (r.isAditivada) g.litrosAditivada += liters;
    else if (r.fuelName === 'gasolina') g.litrosGasolinaComum += liters;
    if (!g.ultimoAbastecimento || r.fuelingDateTime > g.ultimoAbastecimento) g.ultimoAbastecimento = r.fuelingDateTime;
  }

  const frentistas = Array.from(groups.values()).map((g) => {
    const gasTotal = g.litrosGasolinaComum + g.litrosAditivada;
    return {
      key: g.key, attendantId: g.attendantId, nome: g.nome, photoUrl: g.photoUrl,
      identificado: g.identificado, codigo: g.codigo,
      litrosTotal: round2(g.litrosTotal),
      litrosGasolinaComum: round2(g.litrosGasolinaComum),
      litrosAditivada: round2(g.litrosAditivada),
      mixAditivada: gasTotal > 0 ? round2((g.litrosAditivada / gasTotal) * 100) : null, // % de penetração
      valorTotal: round2(g.valorTotal),
      qtd: g.qtd,
      ultimoAbastecimento: g.ultimoAbastecimento,
    };
  }).sort((a, b) => b.valorTotal - a.valorTotal);

  const totais = frentistas.reduce((t, x) => ({
    litrosTotal: round2(t.litrosTotal + x.litrosTotal),
    litrosAditivada: round2(t.litrosAditivada + x.litrosAditivada),
    valorTotal: round2(t.valorTotal + x.valorTotal),
    qtd: t.qtd + x.qtd,
  }), { litrosTotal: 0, litrosAditivada: 0, valorTotal: 0, qtd: 0 });

  // Big numbers: the 6 frentistas who fueled most recently (today), each with their own mix %.
  const ultimosMix = frentistas
    .filter((fr) => fr.ultimoAbastecimento)
    .sort((a, b) => b.ultimoAbastecimento - a.ultimoAbastecimento)
    .slice(0, 6)
    .map((fr) => ({ key: fr.key, attendantId: fr.attendantId, nome: fr.nome, mixAditivada: fr.mixAditivada, ultimoAbastecimento: fr.ultimoAbastecimento }));

  // Day-by-day mix trend, one series per frentista (same key scheme as the main board).
  const seriesMeta = new Map(); // key -> { id, nome }
  const byDay = new Map(); // day -> Map(key -> { comum, aditivada })
  for (const r of historyRows) {
    const att = r.identfidCode ? cardToAtt.get(r.identfidCode) : null;
    const key = att ? att.id : (r.identfidCode ? `code:${r.identfidCode}` : 'sem-identificador');
    const nome = att ? att.name : (r.identfidCode ? `Não identificado (código ${r.identfidCode})` : 'Sem identificador');
    if (!seriesMeta.has(key)) seriesMeta.set(key, { id: key, nome });

    const day = localDay(r.fuelingDateTime);
    if (!byDay.has(day)) byDay.set(day, new Map());
    const dayMap = byDay.get(day);
    if (!dayMap.has(key)) dayMap.set(key, { comum: 0, aditivada: 0 });
    const bucketDay = dayMap.get(key);
    const liters = f(r.volumeLiters);
    if (r.isAditivada) bucketDay.aditivada += liters;
    else if (r.fuelName === 'gasolina') bucketDay.comum += liters;
  }

  const mixHistoricoSeries = Array.from(seriesMeta.values());
  const mixHistorico = [];
  for (let i = historyDays - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const day = localDay(d);
    const dayMap = byDay.get(day) || new Map();
    const point = { data: day };
    for (const s of mixHistoricoSeries) {
      const bucketDay = dayMap.get(s.id);
      const gasTotal = bucketDay ? bucketDay.comum + bucketDay.aditivada : 0;
      point[s.id] = gasTotal > 0 ? round2((bucketDay.aditivada / gasTotal) * 100) : null;
    }
    mixHistorico.push(point);
  }

  // Collective board: every frentista's day + totals. No per-person self-view.
  return {
    periodo: { hoje: date, tz: TZ },
    frentistas,
    totais,
    ultimosMix,
    mixHistorico,
    mixHistoricoSeries,
  };
}

module.exports = { dashboard, todayRange };
