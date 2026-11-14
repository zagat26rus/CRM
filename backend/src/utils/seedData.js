const { getCurrentTime } = require('../config/database');

function seedCompanyDictionaries(db, companyId) {
  // Check if already seeded
  const brandsCount = db.prepare('SELECT COUNT(*) as count FROM brands WHERE companyId = ?').get(companyId).count;
  const problemsCount = db.prepare('SELECT COUNT(*) as count FROM common_problems WHERE companyId = ?').get(companyId).count;
  if (brandsCount > 0 && problemsCount > 0) return;

  const now = getCurrentTime();
  const defaultBrands = [
    { name: 'Apple', icon: '' },
    { name: 'Samsung', icon: '' },
    { name: 'Xiaomi', icon: '' },
    { name: 'Huawei', icon: '' },
    { name: 'Honor', icon: '' },
    { name: 'Realme', icon: '' },
    { name: 'Oppo', icon: '' },
    { name: 'Vivo', icon: '' },
    { name: 'Google', icon: '' },
    { name: 'OnePlus', icon: '' },
    { name: 'Sony', icon: '' },
    { name: 'LG', icon: '' },
    { name: 'Nokia', icon: '' },
    { name: 'Tecno', icon: '' },
    { name: 'Infinix', icon: '' },
    { name: 'Asus', icon: '' }
  ];

  const insertBrand = db.prepare('INSERT OR IGNORE INTO brands (companyId, name, icon, createdAt) VALUES (?, ?, ?, ?)');
  
  const tx = db.transaction(() => {
    // Brands
    for (const b of defaultBrands) {
       insertBrand.run(companyId, b.name, b.icon, now);
    }

    // Common Problems
    const defaultProblems = [
      ['Замена дисплея', 'Замена экрана устройства', 5000, 8000, 'Смартфон'],
      ['Замена аккумулятора', 'Замена батареи', 1500, 2500, 'Смартфон'],
      ['Замена задней крышки', 'Замена задней панели', 1000, 2000, 'Смартфон'],
      ['Чистка от влаги', 'Ультразвуковая чистка после попадания влаги', 1000, 2000, 'Смартфон'],
      ['Замена разъема зарядки', 'Замена USB/Type-C разъема', 800, 1500, 'Смартфон'],
      ['Прошивка/перепрошивка', 'Восстановление ПО устройства', 500, 1000, 'Смартфон'],
      ['Замена динамика', 'Замена спикера', 500, 1000, 'Смартфон'],
      ['Замена микрофона', 'Замена микрофона', 500, 1000, 'Смартфон']
    ];
    const insertProblem = db.prepare(`
      INSERT OR IGNORE INTO common_problems (companyId, name, description, defaultCostPrice, defaultPrice, deviceType, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const p of defaultProblems) {
      insertProblem.run(companyId, p[0], p[1], p[2], p[3], p[4], now);
    }
  });

  tx();
}

// Legacy function stub to prevent crash in index.js before update
function seedDefaultData(db) {
  // Do nothing or seed for companyId=1 if exists
  const firstComp = db.prepare('SELECT id FROM companies ORDER BY id LIMIT 1').get();
  if (firstComp) {
    seedCompanyDictionaries(db, firstComp.id);
  }
}

module.exports = { seedCompanyDictionaries, seedDefaultData };
