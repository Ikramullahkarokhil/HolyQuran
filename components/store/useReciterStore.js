import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_RECITER_ID } from "../../components/reciters.js";

export const useReciterStore = create(
  persist(
    (set) => ({
      reciterId: DEFAULT_RECITER_ID,
      setReciterId: (id) => set({ reciterId: Number(id) }),
    }),
    {
      name: "reciter-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
