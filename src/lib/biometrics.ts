import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/**
 * Biometric login: when a driver turns it on, their mobile number and
 * password are kept in the phone's secure keychain/keystore, and only
 * released after a successful fingerprint / face check. Signing out keeps
 * them, so the next login is a fingerprint instead of typing the password.
 */

const KEY = 'tuktuk.biometricLogin';

type Saved = { mobile: string; password: string };

const STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** The mobile number biometric login is set up for, if any. Doesn't prompt. */
export async function biometricMobile(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(KEY, STORE_OPTS).catch(() => null);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as Saved).mobile;
  } catch {
    return null;
  }
}

export async function confirmWithBiometrics(promptMessage: string, cancelLabel: string): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel });
  return r.success;
}

export async function enableBiometricLogin(mobile: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ mobile, password } satisfies Saved), STORE_OPTS);
}

export async function disableBiometricLogin(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, STORE_OPTS).catch(() => {});
}

/** Fingerprint / face check, then hand back the saved credentials. Null if cancelled or not set up. */
export async function unlockSavedLogin(promptMessage: string, cancelLabel: string): Promise<Saved | null> {
  const raw = await SecureStore.getItemAsync(KEY, STORE_OPTS).catch(() => null);
  if (!raw) return null;
  if (!(await confirmWithBiometrics(promptMessage, cancelLabel))) return null;
  try {
    return JSON.parse(raw) as Saved;
  } catch {
    return null;
  }
}
