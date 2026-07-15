/**
 * Global test setup — runs before every test file.
 * Imports @testing-library/jest-dom so custom matchers like
 * toBeInTheDocument(), toHaveValue(), etc. are available everywhere.
 */
import '@testing-library/jest-dom'

// Node 26 exposes an incomplete experimental localStorage in Vitest workers.
// Keep a deterministic browser-like implementation for auth/cache tests.
const localStorageData = new Map<string, string>()
const localStorageMock: Storage = {
  get length() { return localStorageData.size },
  clear: () => localStorageData.clear(),
  getItem: (key: string) => localStorageData.get(key) ?? null,
  key: (index: number) => Array.from(localStorageData.keys())[index] ?? null,
  removeItem: (key: string) => { localStorageData.delete(key) },
  setItem: (key: string, value: string) => { localStorageData.set(key, String(value)) },
}

Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageMock })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock })

// jsdom doesn't implement scrollIntoView — stub it out globally
window.HTMLElement.prototype.scrollIntoView = function () {}
