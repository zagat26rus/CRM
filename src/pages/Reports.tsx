export default function Reports(){ return <Empty title='Отчеты'/> }
function Empty({title}:{title:string}){ 
  return <div className='card'><div className='card-inner text-center text-muted py-20'>Раздел «{title}» пока пуст</div></div> 
}