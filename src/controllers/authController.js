const authService = require('../services/authService');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function googleLogin(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ erro: 'Token do Google é obrigatório.' });
    const result = await authService.loginWithGoogle(token);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function facebookLogin(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ erro: 'Token do Facebook é obrigatório.' });
    const result = await authService.loginWithFacebook(token);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { login, googleLogin, facebookLogin };
