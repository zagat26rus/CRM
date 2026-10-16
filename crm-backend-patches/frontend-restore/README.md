# Восстановленные экраны: «Запчасти ИИ» и «Сводка дня»

Бэкенд этих функций (`back/src/routes/ai.js`, `digest.js`, `supplierConnectors/`) лежит на сервере, а их интерфейс был только в собранном
`front/dist` и пропал при пересборке фронта из устаревших исходников сервера. Экраны восстановлены по API.

Файлы (в `front/src/` на сервере):
- `AiParts.tsx` -> `pages/AiParts.tsx`: поиск, сравнение предложений, маржа к прайсу, настройки поставщиков, нейросети и cookie.
- `DailyDigestCard.tsx` -> `components/DailyDigestCard.tsx`: карточка на странице «Тренды».

Подключение:
- `App.tsx`: `import AiParts from './pages/AiParts'`, пункт меню `{ to: '/ai-parts', label: 'Запчасти ИИ' }` после «Склад», маршрут `<Route path='/ai-parts' element={<AiParts/>} />`.
- `pages/Dashboard.tsx`: `import DailyDigestCard from '../components/DailyDigestCard'` и `<DailyDigestCard />` первой строкой в корневом `div`.
