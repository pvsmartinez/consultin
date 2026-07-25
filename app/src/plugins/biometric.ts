import { registerPlugin } from '@capacitor/core';

export interface BiometricPlugin {
  /**
   * Check if biometric authentication is available
   */
  isAvailable(): Promise<{ isAvailable: boolean; biometryType: string }>;

  /**
   * Authenticate with biometrics
   */
  authenticate(options?: {
    reason?: string;
    title?: string;
    subtitle?: string;
    description?: string;
    negativeButtonText?: string;
  }): Promise<{ isAuthenticated: boolean }>;

  /**
   * Check if biometric is enrolled
   */
  isEnrolled(): Promise<{ isEnrolled: boolean }>;
}

const Biometric = registerPlugin<BiometricPlugin>('Biometric');

export default Biometric;
