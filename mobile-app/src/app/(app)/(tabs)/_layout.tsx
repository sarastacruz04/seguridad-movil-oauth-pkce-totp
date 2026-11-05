import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useAppTheme } from '@/theme/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />;
  };
}

export default function TabsLayout() {
  const { colors } = useAppTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }}>
      <Tabs.Screen name="authenticator" options={{ title: 'Authenticator', tabBarIcon: tabIcon('keypad') }} />
      <Tabs.Screen name="boveda" options={{ title: 'Bóveda Crítica', tabBarLabel: 'Bóveda', tabBarIcon: tabIcon('lock-closed') }} />
      <Tabs.Screen
        name="laboratorio"
        options={{ title: 'Laboratorio de seguridad', tabBarLabel: 'Laboratorio', tabBarIcon: tabIcon('flask') }}
      />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: tabIcon('person-circle') }} />
    </Tabs>
  );
}
