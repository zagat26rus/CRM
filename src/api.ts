export type User = { id:number; email:string; name:string; role:string }
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4001'

function headers(token?:string){
  return {
    'Content-Type':'application/json',
    ...(token ? { 'Authorization': 'Bearer ' + token } : {})
  }
}

async function handle(res: Response){
  if(!res.ok){
    const text = await res.text().catch(()=> '')
    const msg = (()=>{ try { return JSON.parse(text).error } catch { return text || res.statusText }})()
    throw new Error(msg || `HTTP ${res.status}`)
  }
  const ct = res.headers.get('content-type')||''
  if(ct.includes('application/json')) return res.json()
  return res.text()
}

export const api = {
  base: BASE,
  async login(email: string, password: string){
    const res = await fetch(BASE + '/api/auth/login', { method:'POST', headers: headers(), body: JSON.stringify({ email, password }) })
    return handle(res) as Promise<{ token:string; user: User }>
  },
  async get<T>(path:string, token:string){
    const res = await fetch(BASE + path, { headers: headers(token) })
    return handle(res) as Promise<T>
  },
  async post<T>(path:string, token:string, body:any){
    const res = await fetch(BASE + path, { method:'POST', headers: headers(token), body: JSON.stringify(body) })
    return handle(res) as Promise<T>
  },
  async put<T>(path:string, token:string, body:any){
    const res = await fetch(BASE + path, { method:'PUT', headers: headers(token), body: JSON.stringify(body) })
    return handle(res) as Promise<T>
  },
  async del<T>(path:string, token:string){
    const res = await fetch(BASE + path, { method:'DELETE', headers: headers(token) })
    return handle(res) as Promise<T>
  }
}


export type DeviceType = { id:number; name:string }
export type Brand = { id:number; name:string }
export type Model = { id:number; brandId:number; name:string }
export type Category = { id:number; name:string }
export type Product = { id:number; categoryId:number|null; name:string; sku?:string|null; price:number; qty:number; createdAt:string }
export type Client = { id:number; name:string; phone?:string; email?:string; notes?:string; createdAt:string }

export const catalogs = {
  async types(token:string){ return api.get<DeviceType[]>('/api/catalog/device-types', token) },
  async addType(token:string, name:string){ return api.post<DeviceType>('/api/catalog/device-types', token, {name}) },
  async brands(token:string){ return api.get<Brand[]>('/api/catalog/brands', token) },
  async addBrand(token:string, name:string){ return api.post<Brand>('/api/catalog/brands', token, {name}) },
  async models(token:string, brandId?:number){ const q = brandId ? ('?brandId='+brandId) : ''; return api.get<Model[]>('/api/catalog/models'+q, token) },
  async addModel(token:string, brandId:number, name:string){ return api.post<Model>('/api/catalog/models', token, {brandId, name}) },
}

export const stock = {
  async categories(token:string){ return api.get<Category[]>('/api/categories', token) },
  async addCategory(token:string, name:string){ return api.post<Category>('/api/categories', token, {name}) },
  async products(token:string){ return api.get<Product[]>('/api/products', token) },
  async addProduct(token:string, p: Partial<Product>){ return api.post<Product>('/api/products', token, p) },
  async updateProduct(token:string, id:number, p: Partial<Product>){ return api.put<Product>('/api/products/'+id, token, p) }
}

export const shop = {
  async sell(token:string, items:{productId:number; qty:number; price:number}[], method?:string){
    return api.post('/api/sales', token, { items, method })
  }
}

export const clientsApi = {
  async list(token:string){ return api.get<Client[]>('/api/clients', token) },
  async add(token:string, c: Partial<Client>){ return api.post<Client>('/api/clients', token, c) }
}
