import { registerPlugin } from '@capacitor/core';

export interface StatusBarPlugin {
  /**
   * Set the status bar style
   */
  setStyle(options: { style: 'light' | 'dark' }): Promise<void>;

  /**
   * Set the status bar background color
   */
  setBackgroundColor(options: { color: string }): Promise<void>;

  /**
   * Show the status bar
   */
  show(): Promise<void>;

  /**
   * Hide the status bar
   */
  hide(): Promise<void>;

  /**
   * Get status bar info
   */
  getInfo(): Promise<{
    visible: boolean;
    style: string;
    color: string;
    height: number;
  }>;

  /**
   * Set status bar overlay mode
   */
  setOverlaysWebView(options: { overlay: boolean }): Promise<void>;
}

const StatusBar = registerPlugin<StatusBarPlugin>('StatusBar');

export default StatusBar;
