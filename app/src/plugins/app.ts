import { registerPlugin } from '@capacitor/core';

export interface AppPlugin {
  /**
   * Get the current app info
   */
  getInfo(): Promise<{
    name: string;
    id: string;
    build: string;
    version: string;
  }>;

  /**
   * Get the current app state
   */
  getState(): Promise<{
    isActive: boolean;
  }>;

  /**
   * Minimize the app (go to background)
   */
  minimizeApp(): Promise<void>;

  /**
   * Exit the app
   */
  exitApp(): Promise<void>;

  /**
   * Add listener for app state changes
   */
  addListener(
    eventName: 'appStateChange',
    listener: (state: { isActive: boolean }) => void
  ): Promise<{ remove: () => void }>;

  /**
   * Add listener for back button (Android)
   */
  addListener(
    eventName: 'backButton',
    listener: (state: { canGoBack: boolean }) => void
  ): Promise<{ remove: () => void }>;

  /**
   * Add listener for deep links
   */
  addListener(
    eventName: 'appUrlOpen',
    listener: (url: { url: string }) => void
  ): Promise<{ remove: () => void }>;

  /**
   * Add listener for app restore
   */
  addListener(
    eventName: 'appRestoredResult',
    listener: (result: any) => void
  ): Promise<{ remove: () => void }>;
}

const App = registerPlugin<AppPlugin>('App');

export default App;
