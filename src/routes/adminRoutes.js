const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { authenticate } = require('../middlewares/authMiddleware');

const EVOLUTION_URL      = process.env.EVOLUTION_API_URL || 'https://postocash-evo-api.onrender.com';
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY || 'postocash-evo-2026';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'postocash';

// GET /admin/whatsapp-status — authenticated
router.get('/whatsapp-status', authenticate, async (req, res) => {
  try {
    const { data } = await axios.get(
      `${EVOLUTION_URL}/instance/fetchInstances`,
      { headers: { apikey: EVOLUTION_API_KEY }, timeout: 10000 }
    );

    const instances = Array.isArray(data) ? data : [];
    const instance  = instances.find(
      (i) => i.instance?.instanceName === EVOLUTION_INSTANCE || i.name === EVOLUTION_INSTANCE
    );

    if (!instance) {
      return res.json({
        connected:    false,
        instanceName: EVOLUTION_INSTANCE,
        phone:        null,
        status:       'not_found',
      });
    }

    const state  = instance.instance?.state ?? instance.connectionStatus ?? 'unknown';
    const phone  = instance.instance?.profilePictureUrl
      ? null
      : instance.instance?.wuid?.split('@')[0] ?? null;

    return res.json({
      connected:    state === 'open',
      instanceName: EVOLUTION_INSTANCE,
      phone:        phone,
      status:       state,
    });
  } catch (err) {
    const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
    return res.status(503).json({
      connected:    false,
      instanceName: EVOLUTION_INSTANCE,
      phone:        null,
      status:       isTimeout ? 'timeout' : 'unreachable',
      error:        err.message,
    });
  }
});

module.exports = router;
