export default function Tasks(){ 
  const days = ['Сегодня','Завтра','Среда','Четверг','Пятница','Суббота','Воскресенье']
  return (<div className='space-y-6'>
    {days.map(d => (
      <div key={d} className='card'>
        <div className='card-inner'>
          <div className='flex items-center justify-between mb-2'>
            <div className='font-semibold'>{d}</div>
            <button className='btn ghost'>+ Задача</button>
          </div>
          <div className='text-muted text-sm'>Задач нет</div>
        </div>
      </div>
    ))}
  </div>) }
function Empty({title}:{title:string}){ 
  return <div className='card'><div className='card-inner text-center text-muted py-20'>Раздел «{title}» пока пуст</div></div> 
}