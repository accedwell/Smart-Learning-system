// The Smart Learning colours, in light and dark. Every dashboard uses the same ones: gold
// (`brand`) for buttons, active tabs, links and progress; navy (`brandInk`) for banners; and
// green / amber / red only for meaning (on track, watch, at risk).
import { useColorScheme } from 'react-native';

const light = {
  bg: '#f6f5ee', surface: '#fffdf6', ink: '#182219', inkSoft: '#5c6b5c', border: '#e4ddc7',
  brand: '#b8791f', brandInk: '#0f1a38', accent: '#f2a63c', chip: '#f2efdf',
  good: '#2f9159', warn: '#c8871a', bad: '#c0392b', onBrand: '#ffffff',
  dark: false,
};

const dark = {
  bg: '#0f1712', surface: '#16211a', ink: '#eaf3ec', inkSoft: '#9db3a4', border: '#28362c',
  brand: '#d9a13c', brandInk: '#0f1a38', accent: '#f2b25a', chip: '#1c2a20',
  good: '#4cb579', warn: '#e3b23c', bad: '#f0776a', onBrand: '#ffffff',
  dark: true,
};

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

// a colour with some transparency, for tinted pills, icons and notes
export function tint(hex, alpha) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + a;
}
