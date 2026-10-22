/**
 * Componente raíz: proveedores globales, fuentes y ajustes.
 */
// Importamos solo los pesos que usamos (cada peso es un archivo de ~100 KB).
import { Manrope_200ExtraLight } from '@expo-google-fonts/manrope/200ExtraLight';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { useFonts } from 'expo-font';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSettings } from './hooks/useSettings';
import { TimerScreen } from './screens/TimerScreen';
import { themeFor } from './theme/theme';

export default function App() {
  const settings = useSettings();
  const [fontsLoaded, fontError] = useFonts({ Manrope_200ExtraLight, Manrope_400Regular });
  const theme = themeFor(useColorScheme());

  // Hasta tener ajustes (última duración) y fuentes, solo pintamos el fondo.
  const ready = settings.ready && (fontsLoaded || fontError !== null);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {ready ? (
          <TimerScreen
            settings={settings}
            fonts={fontsLoaded ? { time: 'Manrope_200ExtraLight', hint: 'Manrope_400Regular' } : {}}
          />
        ) : (
          <View style={[styles.root, { backgroundColor: theme.solid }]} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
