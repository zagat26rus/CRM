const SALE_CATEGORIES = {
  repair: { id: 'repair', label: 'Ремонты' },
  parts: { id: 'parts', label: 'Продажа запчастей' },
  accessories: { id: 'accessories', label: 'Продажа аксессуаров' },
  tech: { id: 'tech', label: 'Продажа техники' },
};

const SALE_CATEGORY_IDS = Object.keys(SALE_CATEGORIES);

function isSaleCategory(value) {
  return SALE_CATEGORY_IDS.includes(String(value || ''));
}

function defaultSaleCategoryForDocType(docType) {
  if (docType === 'work_completion_act') return 'repair';
  if (docType === 'material_release') return 'parts';
  return 'tech';
}

module.exports = {
  SALE_CATEGORIES,
  SALE_CATEGORY_IDS,
  isSaleCategory,
  defaultSaleCategoryForDocType,
};
