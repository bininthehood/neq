import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Outfit_400Regular,
  Outfit_600SemiBold,
} from '@expo-google-fonts/outfit';
// Stage 4 D1: fontsV2 전환은 web 만 실 적용 (next/font Instrument Serif + Geist Mono).
// native 는 패키지 부재로 기존 Fraunces/Outfit 호환 유지. 추후 별도 위임에서 진행:
//   npm install @expo-google-fonts/instrument-serif @expo-google-fonts/geist-mono -w apps/native
// 패키지 설치 후 아래에 useFonts 항목 추가하고 packages/design tokens.ts fonts 매핑 갱신.
import { colors } from '../lib/tokens';
import { useSync } from '../hooks/useSync';
import PostHogProvider from '../components/PostHogProvider';
import { PersonaProvider } from '../contexts/PersonaContext';
import { track } from '../lib/analytics';

SplashScreen.preventAutoHideAsync().catch(() => {});

function TabItem({
  icon,
  label,
  focused,
}: {
  icon: string;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 2, minWidth: 60 }}>
      <Text
        style={{
          color: focused ? colors.accent : colors.textMuted,
          fontSize: 18,
        }}
      >
        {icon}
      </Text>
      <Text
        style={{
          color: focused ? colors.accent : colors.textMuted,
          fontSize: 10,
          fontWeight: focused ? '700' : '500',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function RootLayout() {
  useSync();

  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_700Bold,
    Outfit_400Regular,
    Outfit_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // app_open — root mount 1회 발사. PostHog 미초기화 상태에서도 큐잉되어 안전.
  useEffect(() => {
    track('app_open', { platform: 'native' });
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <PostHogProvider>
      <PersonaProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                height: 72,
                paddingTop: 8,
              },
              tabBarShowLabel: false,
              sceneStyle: { backgroundColor: colors.bg },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                tabBarIcon: ({ focused }) => (
                  <TabItem icon="◉" label="발견" focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="saved"
              options={{
                tabBarIcon: ({ focused }) => (
                  <TabItem icon="♡" label="저장" focused={focused} />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                tabBarIcon: ({ focused }) => (
                  <TabItem icon="◎" label="프로필" focused={focused} />
                ),
              }}
            />
          </Tabs>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </PersonaProvider>
    </PostHogProvider>
  );
}
