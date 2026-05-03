const fraudService = require('../services/fraudService');

async function getSettings(req, res, next) {
  try {
    const settings = await fraudService.getSettings(req.operator.establishmentId);
    res.status(200).json({
      mensagem: 'Configurações antifraude obtidas com sucesso.',
      configuracoes: {
        maxAbastecimentosPorDia:     settings.maxFuelsPerDay,
        maxAbastecimentosPorSemana:  settings.maxFuelsPerWeek,
        maxCashbackPorDia:           parseFloat(settings.maxCashbackPerDay),
        maxValorAbastecimento:       parseFloat(settings.maxFuelAmount),
        maxResgatesPorSemana:        settings.maxRedeemsPerWeek,
        alertarCashbackExcedido:     settings.alertOnCashbackExceed,
        alertarHorarioSuspeito:      settings.alertOnSuspiciousHour,
        atualizadoEm:                settings.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const {
      maxAbastecimentosPorDia,
      maxAbastecimentosPorSemana,
      maxCashbackPorDia,
      maxValorAbastecimento,
      maxResgatesPorSemana,
      alertarCashbackExcedido,
      alertarHorarioSuspeito,
    } = req.body;

    // Map PT-BR field names to internal field names
    const data = {};
    if (maxAbastecimentosPorDia    !== undefined) data.maxFuelsPerDay          = maxAbastecimentosPorDia;
    if (maxAbastecimentosPorSemana !== undefined) data.maxFuelsPerWeek         = maxAbastecimentosPorSemana;
    if (maxCashbackPorDia          !== undefined) data.maxCashbackPerDay       = maxCashbackPorDia;
    if (maxValorAbastecimento      !== undefined) data.maxFuelAmount           = maxValorAbastecimento;
    if (maxResgatesPorSemana       !== undefined) data.maxRedeemsPerWeek       = maxResgatesPorSemana;
    if (alertarCashbackExcedido    !== undefined) data.alertOnCashbackExceed   = alertarCashbackExcedido;
    if (alertarHorarioSuspeito     !== undefined) data.alertOnSuspiciousHour   = alertarHorarioSuspeito;

    const settings = await fraudService.updateSettings(req.operator.establishmentId, data);
    res.status(200).json({
      mensagem: 'Configurações antifraude atualizadas com sucesso.',
      configuracoes: {
        maxAbastecimentosPorDia:     settings.maxFuelsPerDay,
        maxAbastecimentosPorSemana:  settings.maxFuelsPerWeek,
        maxCashbackPorDia:           parseFloat(settings.maxCashbackPerDay),
        maxValorAbastecimento:       parseFloat(settings.maxFuelAmount),
        maxResgatesPorSemana:        settings.maxRedeemsPerWeek,
        alertarCashbackExcedido:     settings.alertOnCashbackExceed,
        alertarHorarioSuspeito:      settings.alertOnSuspiciousHour,
        atualizadoEm:                settings.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getBlacklist(req, res, next) {
  try {
    const result = await fraudService.getBlacklist(req.operator.establishmentId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function addToBlacklist(req, res, next) {
  try {
    const { cpf, motivo } = req.body;
    const result = await fraudService.addToBlacklist(
      cpf,
      motivo,
      req.operator.id,
      req.operator.establishmentId
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function removeFromBlacklist(req, res, next) {
  try {
    const result = await fraudService.removeFromBlacklist(
      req.params.cpf,
      req.operator.establishmentId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings, getBlacklist, addToBlacklist, removeFromBlacklist };
