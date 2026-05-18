import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppLanguage = "vi" | "en";

interface LanguageState {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: "vi",
      setLanguage: (language) => set({ language }),
      toggleLanguage: () =>
        set({ language: get().language === "vi" ? "en" : "vi" }),
    }),
    {
      name: "find-app-language",
    },
  ),
);
