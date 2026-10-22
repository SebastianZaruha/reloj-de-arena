/**
 * Adaptador de AsyncStorage a la interfaz `KeyValueStorage` del core.
 *
 * El core no sabe nada de AsyncStorage: solo conoce la interfaz. Este
 * pequeño adaptador es lo único que habría que cambiar para guardar en
 * otro sitio (en escritorio, por ejemplo).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStorage } from '@reloj/core';

export const asyncStorageAdapter: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
