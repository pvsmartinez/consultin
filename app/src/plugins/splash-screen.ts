import { registerPlugin } from '@capacitor/core';

export interface SplashScreenPlugin {
  /**
   * Show the splash screen
   */
  show(options?: {
    showDuration?: number;
    fadeInDuration?: number;
    fadeOutDuration?: number;
    autoHide?: boolean;
  }): Promise<void>;

  /**
   * Hide the splash screen
   */
  hide(options?: {
    fadeOutDuration?: number;
  }): Promise<void>;
}

const SplashScreen = registerPlugin<SplashScreenPlugin>('SplashScreen');

export default SplashScreen;
