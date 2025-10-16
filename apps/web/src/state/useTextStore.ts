import { create } from 'zustand'
import { openDB } from 'idb'
import { TextDoc, Chunk } from '../types'
import { initAppDB } from '../lib/database';

interface TextState {
  texts: TextDoc[];
  currentText: TextDoc | null;
  isLoading: boolean;
  error: string | null;
  getTexts: () => Promise<TextDoc[]>;
  getTextById: (id: string) => Promise<TextDoc | null>;
  saveText: (text: TextDoc) => Promise<void>;
  deleteText: (id: string) => Promise<void>;
  updateText: (id: string, updates: Partial<TextDoc>) => Promise<void>;
  setCurrentText: (text: TextDoc | null) => void;
}

export const useTextStore = create<TextState>((set, get) => ({
  texts: [],
  currentText: null,
  isLoading: false,
  error: null,

  getTexts: async () => {
    try {
      set({ isLoading: true, error: null });
      const db = await initAppDB();
      const texts = await db.getAll('texts');

      // Sort by createdAt in descending order (newest first)
      const sortedTexts = texts.sort((a, b) => b.createdAt - a.createdAt);

      set({ texts: sortedTexts, isLoading: false });
      return sortedTexts;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return [];
    }
  },

  getTextById: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      const db = await initAppDB();
      const text = await db.get('texts', id);
      set({ isLoading: false, currentText: text || null });
      return text || null;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return null;
    }
  },

  saveText: async (text: TextDoc) => {
    try {
      set({ isLoading: true, error: null });
      const db = await initAppDB();
      await db.put('texts', text);
      
      // Update the texts list if needed
      const texts = get().texts;
      const existingIndex = texts.findIndex(t => t.id === text.id);
      
      if (existingIndex >= 0) {
        const updatedTexts = [...texts];
        updatedTexts[existingIndex] = text;
        set({ texts: updatedTexts, currentText: text });
      } else {
        set({ texts: [text, ...texts], currentText: text });
      }
      
      set({ isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  deleteText: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      const db = await initAppDB();
      await db.delete('texts', id);
      
      // Update the texts list
      const texts = get().texts.filter(text => text.id !== id);
      const currentText = get().currentText;
      
      set({ 
        texts,
        currentText: currentText?.id === id ? null : currentText,
        isLoading: false
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  updateText: async (id: string, updates: Partial<TextDoc>) => {
    try {
      set({ isLoading: true, error: null });
      const db = await initAppDB();
      const text = await db.get('texts', id);
      
      if (!text) {
        throw new Error(`Text with id ${id} not found`);
      }
      
      const updatedText = { ...text, ...updates };
      await db.put('texts', updatedText);
      
      // Update the texts list and current text if needed
      const texts = get().texts;
      const updatedTexts = texts.map(t => t.id === id ? updatedText : t);
      const currentText = get().currentText;
      
      set({ 
        texts: updatedTexts,
        currentText: currentText?.id === id ? updatedText : currentText,
        isLoading: false
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  setCurrentText: (text) => {
    set({ currentText: text });
  }
}));