const MANAGEMENT_ROLES = ['owner', 'admin', 'director'];
const FINANCE_ROLES = MANAGEMENT_ROLES;

function requireManagement(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
  if (!MANAGEMENT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Недостаточно прав для этого действия' });
  }
  next();
}

function requireFinance(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
  if (!FINANCE_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Недостаточно прав для операций с финансами' });
  }
  next();
}

module.exports = { requireManagement, requireFinance, MANAGEMENT_ROLES, FINANCE_ROLES };
