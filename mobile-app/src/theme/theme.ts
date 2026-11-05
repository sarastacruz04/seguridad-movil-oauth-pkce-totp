import { Platform, useColorScheme } from 'react-native';

const light = {
  background: '#F3F5F9',
  surface: '#FFFFFF',
  surfaceMuted: '#E9EDF4',
  border: '#D7DCE5',
  text: '#14213D',
  textMuted: '#5B6475',
  primary: '#0B3D91',
  onPrimary: '#FFFFFF',
  success: '#127A43',
  successBg: '#E3F5EA',
  warning: '#8A5A00',
  warningBg: '#FFF4D9',
  danger: '#B42318',
  dangerBg: '#FDECEC',
  info: '#0B3D91',
  infoBg: '#E4ECFA',
};

const dark: typeof light = {
  background: '#0E1420',
  surface: '#172033',
  surfaceMuted: '#1F2A40',
  border: '#2A3550',
  text: '#E8EDF7',
  textMuted: '#9AA5B8',
  primary: '#5B9BFF',
  onPrimary: '#0E1420',
  success: '#5BD68F',
  successBg: '#15352A',
  warning: '#FFD27A',
  warningBg: '#3A2E12',
  danger: '#FF8A80',
  dangerBg: '#3A1717',
  info: '#8DB8FF',
  infoBg: '#16264A',
};

export type AppColors = typeof light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Tipografía monoespaciada nativa para el código TOTP (Menlo en iOS, monospace en Android). */
export const monoFont = Platform.select({ ios: 'Menlo', default: 'monospace' });

export function useAppTheme(): { colors: AppColors; isDark: boolean } {
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? dark : light, isDark };
}
