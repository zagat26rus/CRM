import { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Field({label, required, children}:{label:string; required?:boolean; children:any}){
  return (
    <label className='block'>
      <span className='label'>{label}{required && ' *'}</span>
      {children}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>){
  return <input {...props} className={'input ' + (props.className||'')} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>){
  return <textarea {...props} className={'textarea min-h-24 ' + (props.className||'')} />
}

export function Select({options, ...rest}:{options:{value:string;label:string}[]} & InputHTMLAttributes<HTMLSelectElement>){
  return (
    <select {...rest as any} className={'select ' + (rest.className||'')}>
      <option value='' hidden>Выберите значение</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
