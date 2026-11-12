import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HELP_ARTICLES, HELP_CATEGORIES, HELP_CONTACTS } from '../content/helpArticles'

export default function Help() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [openId, setOpenId] = useState<string | null>(HELP_ARTICLES[0]?.id || null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return HELP_ARTICLES.filter((a) => {
      if (category !== 'all' && a.category !== category) return false
      if (!q) return true
      return a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    })
  }, [search, category])

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-xl font-bold'>Помощь</h1>
        <p className='text-sm text-muted mt-1'>Инструкции по работе с FixNet CRM</p>
      </div>

      <div className='grid lg:grid-cols-3 gap-4'>
        <div className='card lg:col-span-2'>
          <div className='card-inner space-y-4'>
            <input
              className='input'
              placeholder='Поиск по справке…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className='flex flex-wrap gap-2'>
              <button type='button' className={`tag ${category === 'all' ? 'tag-active' : ''}`} onClick={() => setCategory('all')}>Все</button>
              {HELP_CATEGORIES.map((c) => (
                <button key={c} type='button' className={`tag ${category === c ? 'tag-active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>

            <div className='space-y-2'>
              {filtered.length === 0 ? (
                <p className='text-muted text-sm py-8 text-center'>Ничего не найдено</p>
              ) : (
                filtered.map((article) => {
                  const isOpen = openId === article.id
                  return (
                    <div key={article.id} className='border border-border rounded-xl overflow-hidden'>
                      <button
                        type='button'
                        className='w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-surface/50 transition'
                        onClick={() => setOpenId(isOpen ? null : article.id)}
                      >
                        <div>
                          <div className='text-xs text-muted mb-0.5'>{article.category}</div>
                          <div className='font-medium'>{article.title}</div>
                        </div>
                        <span className='text-muted text-lg'>{isOpen ? '−' : '+'}</span>
                      </button>
                      {isOpen && (
                        <div className='px-4 pb-4 text-sm text-muted border-t border-border pt-3 whitespace-pre-wrap'>
                          {article.body}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='card'>
            <div className='card-inner space-y-3 text-sm'>
              <div className='font-semibold'>Быстрые ссылки</div>
              <Link to='/orders' className='block text-primary hover:underline'>Заказы</Link>
              <Link to='/documentation' className='block text-primary hover:underline'>Документация</Link>
              <Link to='/payments' className='block text-primary hover:underline'>Платежи</Link>
              <Link to='/reports' className='block text-primary hover:underline'>Отчёты</Link>
              <Link to='/settings' className='block text-primary hover:underline'>Настройки</Link>
            </div>
          </div>

          <div className='card'>
            <div className='card-inner space-y-2 text-sm'>
              <div className='font-semibold'>Контакты FixNet</div>
              <div><span className='text-muted'>Телефон:</span> {HELP_CONTACTS.phone}</div>
              <div><span className='text-muted'>Email:</span> {HELP_CONTACTS.email}</div>
              <div><span className='text-muted'>Адрес:</span> {HELP_CONTACTS.address}</div>
              <a href={HELP_CONTACTS.site} target='_blank' rel='noreferrer' className='inline-block text-primary hover:underline mt-1'>
                fixnet.pro
              </a>
            </div>
          </div>

          <div className='card'>
            <div className='card-inner text-sm text-muted'>
              <div className='font-semibold text-text mb-2'>Подсказка</div>
              Кнопка «Справка» в шапке открывает этот раздел. Для печати документов используйте «Документация» или кнопку «Печать» в заказе.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
