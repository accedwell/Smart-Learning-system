// Small saved values (the sign-in token, the chosen language). On a phone they go in the
// device's secure storage; in a web preview, in the browser's storage.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const web = Platform.OS === 'web';

export async function getItem(key) {
  try {
    return web ? window.localStorage.getItem(key) : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key, value) {
  try {
    if (web) window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // not remembered: the person logs in again next time
  }
}

export async function removeItem(key) {
  try {
    if (web) window.localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // nothing to forget
  }
}
