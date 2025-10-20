const createNoopStorage = (): Storage => ({
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
})

export const safeLocalStorage = (): Storage =>
  typeof window !== 'undefined' && window.localStorage ? window.localStorage : createNoopStorage()
