export default function Help(){ return <div className='card'><div className='card-inner'><div className='font-semibold mb-2'>Помощь</div><p className='text-muted'>Раздел в разработке.</p></div></div> }
function Empty({title}:{title:string}){ 
  return <div className='card'><div className='card-inner text-center text-muted py-20'>Раздел «{title}» пока пуст</div></div> 
}