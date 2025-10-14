import { useState } from 'react'
import Modal from './Modal'
import { Field, Input, Select, Textarea } from './Form'

export default function MoneyModal({title, onClose, onSave}:{title:'Приход'|'Расход'; onClose:()=>void; onSave:(sum:number)=>void}){
  const [form, setForm] = useState<any>({method:'Карта'})
  function handle(e:any){
    e.preventDefault()
    onSave(Number(form.sum)||0)
    onClose()
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form className='space-y-6' onSubmit={handle}>
        <Field label='Метод *'>
          <div className='flex gap-6 text-sm'>
            {['Карта','Наличные','Безналичные'].map(m => (
              <label key={m} className='flex items-center gap-2'>
                <input type='radio' name='method' defaultChecked={m==='Карта'} onChange={()=>setForm({...form, method:m})}/>{m} *
              </label>
            ))}
          </div>
        </Field>
        <Field label='Сумма, ₽ *'><Input value={form.sum||''} onChange={e=>setForm({...form,sum:e.target.value})} placeholder='Введите значение' /></Field>
        <Field label='Статья'>
          <Select options={[
            {value:'продажа', label:'Продажа'},
            {value:'ремонт', label:'Ремонт'},
            {value:'зарплата', label:'Зарплата'},
            {value:'продолговые', label:'Прочие'}
          ]} />
        </Field>
        <Field label='Комментарий'><Textarea placeholder='Введите значение' /></Field>
        <button className='btn'>Сохранить</button>
      </form>
    </Modal>
  )
}
