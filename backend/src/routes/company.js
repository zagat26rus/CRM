const express = require('express');
const router = express.Router();
const { db, getCurrentTime } = require('../config/database');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { getCompanySettings, mergeCompanySettings } = require('../utils/companySettings');
const { publicClientSms, sendSms } = require('../utils/smsService');

router.use(requireAuth);

// Получить данные компании
router.get('/', (req, res) => {
  try {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.companyId);
    if (!company) return res.status(404).json({ error: 'Компания не найдена' });
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения компании' });
  }
});

function maskSettingsForClient(settings) {
  const out = { ...settings };
  if (out.aiPartsSearch) {
    out.aiPartsSearch = {
      ...out.aiPartsSearch,
      llm: {
        ...out.aiPartsSearch.llm,
        apiKey: out.aiPartsSearch.llm?.apiKey ? '***' : '',
        apiKeySet: Boolean(out.aiPartsSearch.llm?.apiKey),
      },
      greensparkCookieSet: Boolean(out.aiPartsSearch.greensparkCookie),
      greensparkCookie: out.aiPartsSearch.greensparkCookie ? '***' : '',
      libertiCookieSet: Boolean(out.aiPartsSearch.libertiCookie),
      libertiCookie: out.aiPartsSearch.libertiCookie ? '***' : '',
      siriustCookieSet: Boolean(out.aiPartsSearch.siriustCookie),
      siriustCookie: out.aiPartsSearch.siriustCookie ? '***' : '',
    };
  }
  if (out.clientSms) {
    out.clientSms = publicClientSms(out.clientSms);
  }
  return out;
}

router.get('/settings', (req, res) => {
  try {
    const settings = getCompanySettings(db, req.user.companyId);
    res.json(maskSettingsForClient(settings));
  } catch (e) {
    console.error('Ошибка получения настроек:', e);
    res.status(500).json({ error: 'Ошибка получения настроек' });
  }
});

router.put('/settings', requireRole(['owner', 'admin']), (req, res) => {
  try {
    const {
      orderStatuses,
      notificationTemplates,
      warrantyDaysDefault,
      aiPartsSearch,
      clientSms,
      dailyDigest,
    } = req.body || {};
    const patch = {};

    if (orderStatuses !== undefined) {
      if (!Array.isArray(orderStatuses) || orderStatuses.length < 2) {
        return res.status(400).json({ error: 'Укажите минимум 2 статуса заказа' });
      }
      patch.orderStatuses = orderStatuses.map((s) => String(s).trim()).filter(Boolean);
    }

    if (notificationTemplates !== undefined) {
      if (typeof notificationTemplates !== 'object' || notificationTemplates === null) {
        return res.status(400).json({ error: 'Некорректные шаблоны уведомлений' });
      }
      patch.notificationTemplates = notificationTemplates;
    }

    if (warrantyDaysDefault !== undefined) {
      const d = Number(warrantyDaysDefault);
      if (!Number.isFinite(d) || d < 1 || d > 3650) {
        return res.status(400).json({ error: 'Срок гарантии: от 1 до 3650 дней' });
      }
      patch.warrantyDaysDefault = d;
    }

    if (aiPartsSearch !== undefined) {
      if (typeof aiPartsSearch !== 'object' || aiPartsSearch === null) {
        return res.status(400).json({ error: 'Некорректные настройки ИИ' });
      }
      patch.aiPartsSearch = aiPartsSearch;
    }

    if (clientSms !== undefined) {
      if (typeof clientSms !== 'object' || clientSms === null) {
        return res.status(400).json({ error: 'Некорректные настройки SMS' });
      }
      patch.clientSms = clientSms;
    }

    if (dailyDigest !== undefined) {
      if (typeof dailyDigest !== 'object' || dailyDigest === null) {
        return res.status(400).json({ error: 'Некорректные настройки сводки' });
      }
      patch.dailyDigest = dailyDigest;
    }

    const updated = mergeCompanySettings(db, req.user.companyId, patch);
    res.json(maskSettingsForClient(updated));
  } catch (e) {
    console.error('Ошибка сохранения настроек:', e);
    res.status(500).json({ error: 'Ошибка сохранения настроек' });
  }
});

/** Test SMS with current company settings (owner/admin). */
router.post('/settings/sms-test', requireRole(['owner', 'admin']), async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    const text = String(req.body?.text || 'Тест SMS из FixNet CRM').trim();
    if (!phone) return res.status(400).json({ error: 'Укажите телефон' });
    // Temporarily force-enabled path: sendSms checks enabled flag — allow override for test
    const settings = getCompanySettings(db, req.user.companyId);
    if (!settings.clientSms?.enabled) {
      return res.status(400).json({ error: 'Сначала включите SMS в настройках и сохраните' });
    }
    const result = await sendSms(db, req.user.companyId, { phone, text });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('sms-test', e);
    res.status(500).json({ error: e.message || 'sms_test_failed' });
  }
});

// Обновить данные компании (только владелец)
router.put('/', requireRole('owner'), (req, res) => {
  try {
    const { name, inn, city, address } = req.body;
    
    if (!name) return res.status(400).json({ error: 'Название компании обязательно' });

    const now = getCurrentTime();
    db.prepare(`
      UPDATE companies 
      SET name = ?, inn = ?, city = ?, address = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      name.trim(),
      inn ? String(inn).trim() : null,
      city ? String(city).trim() : '',
      address ? String(address).trim() : '',
      now,
      req.user.companyId
    );

    const updated = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.user.companyId);
    res.json(updated);
  } catch (error) {
    console.error('Ошибка обновления компании:', error);
    res.status(500).json({ error: 'Ошибка обновления компании' });
  }
});

module.exports = router;




