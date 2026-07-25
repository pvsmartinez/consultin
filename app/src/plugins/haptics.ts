import { registerPlugin } from '@capacitor/core';

export interface HapticsPlugin {
  /**
   * Trigger a haptic impact
   */
  impact(options?: {
    style: 'heavy' | 'medium' | 'light' | 'rigid' | 'soft';
  }): Promise<void>;

  /**
   * Trigger a haptic notification
   */
  notification(options?: {
    type: 'success' | 'warning' | 'error';
  }): Promise<void>;

  /**
   * Trigger a haptic vibration
   */
  vibrate(options?: {
    duration?: number;
  }): Promise<void>;

  /**
   * Trigger a selection changed haptic
   */
  selectionStart(): Promise<void>;

  /**
   * Trigger a selection changed haptic
   */
  selectionChanged(): Promise<void>;

  /**
   * Trigger a selection ended haptic
   */
  selectionEnd(): Promise<void>;
}

const Haptics = registerPlugin<HapticsPlugin>('Haptics');

export default Haptics;
