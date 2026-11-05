import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="scan" options={{ presentation: 'modal', title: 'Escanear QR', headerTransparent: false }} />
    </Stack>
  );
}
