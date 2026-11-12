import { ComponentProps, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import Select from './Select'

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

export function SelectField({options, ...rest}:{options:{value:string;label:string}[]} & Omit<ComponentProps<typeof Select>, 'children'>){
  return (
    <Select {...rest} options={[{ value: '', label: 'Выберите значение' }, ...options]} />
  )
}

export { Select }
