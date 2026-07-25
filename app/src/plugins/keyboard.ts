import { registerPlugin } from '@capacitor/core';

export interface KeyboardPlugin {
  /**
   * Show the keyboard
   */
  show(): Promise<void>;

  /**
   * Hide the keyboard
   */
  hide(): Promise<void>;

  /**
   * Check if keyboard is visible
   */
  isVisible(): Promise<{ isVisible: boolean }>;

  /**
   * Get keyboard height
   */
  getKeyboardHeight(): Promise<{ height: number }>;

  /**
   * Set keyboard style (light/dark)
   */
  setStyle(options: { style: 'light' | 'dark' }): Promise<void>;

  /**
   * Set whether the keyboard should resize the webview
   */
  setResizeMode(options: { mode: 'none' | 'body' | 'ionic' }): Promise<void>;

  /**
   * Add listener for keyboard events
   */
  addListener(
    eventName: 'keyboardWillShow' | 'keyboardDidShow' | 'keyboardWillHide' | 'keyboardDidHide',
    listener: (info: { keyboardHeight: number }) => void
  ): Promise<{ remove: () => void }>;
}

const Keyboard = registerPlugin<KeyboardPlugin>('Keyboard');

export default Keyboard;
