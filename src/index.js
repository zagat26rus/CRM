// Получить методы оплаты
app.get('/api/payment-methods', (req, res) => {
  res.json([
    { id: 'card', name: 'Карта', icon: '💳' },
    { id: 'cash', name: 'Наличные', icon: '💰' },
    { id: 'bank', name: 'Банковский перевод', icon: '🏦' },
    { id: 'online', name: 'Онлайн оплата', icon: '🌐' }
  ]);
});