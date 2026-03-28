import { create } from "zustand";
import { api } from "../api/client.js";

interface AuthStore {
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: localStorage.getItem("token"),

  login: async (username, password) => {
    try {
      const { token } = await api.login(username, password);
      localStorage.setItem("token", token);
      set({ token });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    set({ token: null });
  },

  isAuthenticated: () => !!get().token,
}));
