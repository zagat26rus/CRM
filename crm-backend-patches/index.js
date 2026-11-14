const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { db } = require('./config/database');
const { seedDefaultData } = require('./utils/seedData');
const taskRoutes = require('./routes/tasks');

const app = express();
const PORT = process.env.PORT || 5000;

const extraCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:5175',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'https://www.fixnet.pro',
    'https://fixnet.pro',
    'https://fedfix.ru',
    'https://www.fedfix.ru',
    'http://fedfix.ru',
    'http://www.fedfix.ru',
    ...extraCorsOrigins
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Webhook-Secret']
}));
app.use(express.json());

// Static for uploaded files (order history attachments)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Импорт маршрутов
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const brandRoutes = require('./routes/brands');
const problemRoutes = require('./routes/problems');
const categoryRoutes = require('./routes/categories');
const clientsRouter = require('./routes/clients');
const inventoryRoutes = require('./routes/inventory');
const authRoutes = require('./routes/auth');
const inviteRoutes = require('./routes/invites');
const usersRoutes = require('./routes/users');
const companyRoutes = require('./routes/company');
const integrationsRoutes = require('./routes/integrations');
const shopRoutes = require('./routes/shop');
const invoiceRoutes = require('./routes/invoices');
const servicesRoutes = require('./routes/services');
const catalogRoutes = require('./routes/catalog');
const documentsRoutes = require('./routes/documents');
const analyticsRoutes = require('./routes/analytics');
const chatRoutes = require('./routes/chat');
const announcementsRoutes = require('./routes/announcements');
const marketingRoutes = require('./routes/marketing');
const searchRoutes = require('./routes/search');
const warrantiesRoutes = require('./routes/warranties');
const publicTrackRoutes = require('./routes/publicTrack');
const aiRoutes = require('./routes/ai');
const aiAgentRoutes = require('./routes/aiAgent');
const digestRoutes = require('./routes/digest');
const telegram = require('./telegram');

// Подключаем маршруты
app.use('/api/public', publicTrackRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/clients', clientsRouter);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/warranties', warrantiesRoutes);
app.use('/api/ai/agent', aiAgentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/digest', digestRoutes);
app.use('/api/telegram', telegram.router);

// Базовые маршруты
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Методы оплаты (простой эндпоинт)
app.get('/api/payment-methods', (req, res) => {
  res.json([
    { id: 'card', name: 'Карта', icon: '' },
    { id: 'cash', name: 'Наличные', icon: '' },
    { id: 'bank', name: 'Банковский перевод', icon: '' },
    { id: 'online', name: 'Онлайн оплата', icon: '' }
  ]);
});

// Заполнение дефолтными данными
seedDefaultData(db);

// Локальное десктоп-приложение: отдаём собранный фронтенд с того же порта
const frontDist = process.env.FRONT_DIST_PATH
  ? path.resolve(process.env.FRONT_DIST_PATH)
  : path.resolve(__dirname, '..', '..', 'front', 'dist');
const serveFrontend = process.env.SERVE_FRONTEND === '1'
  || (fs.existsSync(path.join(frontDist, 'index.html')) && process.env.SERVE_FRONTEND !== '0');

if (serveFrontend) {
  app.use(express.static(frontDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(frontDist, 'index.html'));
  });
}

// 404 handler (должен быть ПОСЛЕ всех маршрутов)
app.use('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    console.log(`404: API маршрут не найден: ${req.originalUrl}`);
    return res.status(404).json({ error: 'Маршрут не найден' });
  }
  console.log(`404: Маршрут не найден: ${req.originalUrl}`);
  res.status(404).json({ error: 'Маршрут не найден' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  telegram.start();
  if (serveFrontend) {
    console.log(`CRM интерфейс: http://localhost:${PORT}`);
  }
  console.log(`API доступно по адресу: http://localhost:${PORT}/api`);
  console.log(`Заказы: http://localhost:${PORT}/api/orders`);
  console.log(`Клиенты: http://localhost:${PORT}/api/clients`); // Добавьте эту строку
  console.log(`Бренды: http://localhost:${PORT}/api/brands`);
  console.log(`Поломки: http://localhost:${PORT}/api/problems`);
  console.log(`Платежи: http://localhost:${PORT}/api/payments`);
  console.log(`Категории: http://localhost:${PORT}/api/categories`);
  console.log(`Задачи: http://localhost:${PORT}/api/tasks`);
});