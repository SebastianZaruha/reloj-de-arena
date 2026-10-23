/**
 * Componente raíz: proveedores globales, fuentes y ajustes.
 */
// Importamos solo los pesos que usamos (cada peso es un archivo de ~100 KB).
import { Manrope_200ExtraLight } from '@expo-google-fonts/manrope/200ExtraLight';
import { Manrope_300Light } from '@expo-google-fonts/manrope/300Light';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { useFonts } from 'expo-font';
import { StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSettings } from './hooks/useSettings';
import { TimerScreen, type ScreenFonts } from './screens/TimerScreen';
import { resolveScheme, themeFor } from './theme/theme';

/** Familias de Manrope (en React Native cada peso es una familia propia). */
const FONTS: ScreenFonts = {
  time: 'Manrope_200ExtraLight', // el tiempo
  light: 'Manrope_300Light', // números del menú
  hint: 'Manrope_400Regular', // pistas
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium', // textos del menú
  semibold: 'Manrope_600SemiBold', // opción elegida y rótulos
};

export default function App() {
  const settings = useSettings();
  const [fontsLoaded, fontError] = useFonts({
    Manrope_200ExtraLight,
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
  });
  // Mientras se leen los ajustes (milisegundos) seguimos al sistema; después,
  // el tema elegido. Así el fondo de carga ya tiene el color correcto.
  const system = useColorScheme();
  const background = themeFor(
    resolveScheme(settings.ready ? settings.settings.theme : 'system', system),
  ).solid;

  // Hasta tener ajustes y fuentes, solo pintamos el fondo.
  const ready = settings.ready && (fontsLoaded || fontError !== null);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: background }]}>
      <SafeAreaProvider>
        {ready ? <TimerScreen settings={settings} fonts={fontsLoaded ? FONTS : {}} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
