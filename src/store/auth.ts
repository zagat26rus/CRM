import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, User } from '../api'

type AuthState = {
  token?: string
  user?: User
  loading: boolean
  login: (email:string, password:string) => Promise<void>
  logout: () => void
}

export const useAuth = create<AuthState>()(persist((set, get) => ({
  token: undefined,
  user: undefined,
  loading: false,
  async login(email, password){
    set({ loading: true })
    try {
      const { token, user } = await api.login(email, password)
      set({ token, user, loading:false })
    } catch (e:any){
      set({ loading:false })
      throw e
    }
  },
  logout(){
    set({ token: undefined, user: undefined })
  }
}), { name:'fixnet-auth' }))
