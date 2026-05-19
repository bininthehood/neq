import { useEffect, useState } from 'react';
import { Tabs, router, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { hasOnboarded } from '../lib/store';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Outfit_400Regular,
  Outfit_600SemiBold,
} from '@expo-google-fonts/outfit';
// 2026-05-18 Fix B — fontsV2 native 적용. web (next/font Instrument Serif + Geist Mono) 정합.
// 단 SwipeCard 의 영화/시리즈 + 별점 라벨 (fonts.data) 은 현 디자인 유지 (사용자 요청).
// Pretendard Variable 은 Expo Google Fonts 미존재 — 시스템 폰트 fallback (iOS San Francisco
// 가 한글/영문 본문 가독성 우수). 후속 작업에서 expo-font 로 직접 로드 검토.
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
} from '@expo-google-fonts/geist-mono';
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
    // 기존 Fraunces/Outfit — SwipeCard 의 영화/시리즈 + 별점 라벨 (fonts.data) 유지용
    Fraunces_400Regular,
    Fraunces_700Bold,
    Outfit_400Regular,
    Outfit_600SemiBold,
    // fontsV2 (web 정합) — display + data 신규
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    GeistMono_400Regular,
    GeistMono_500Medium,
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

  // W5 Task A 회귀 fix — root 레벨 onboarding 가드.
  // 기존: Discover (app/index.tsx) 에만 가드 → Tabs 의 Profile/Saved 로 우회 가능.
  // 변경: root mount 시 hasOnboarded() 평가 후 false 면 즉시 router.replace.
  // Discover 의 가드는 fetch skip 효과를 위해 유지 (중복이지만 안전망).
  const [rootGuard, setRootGuard] = useState<'pending' | 'pass'>('pending');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await hasOnboarded();
      if (cancelled) return;
      if (!ok) router.replace('/onboarding');
      setRootGuard('pass');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <PostHogProvider>
      <PersonaProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <TabsWithGuard />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </PersonaProvider>
    </PostHogProvider>
  );
}

// W5 Task A 회귀 fix — onboarding 활성 시 탭바 hide.
// useSegments() 가 변할 때마다 재평가되므로 router.replace 후 자동 반영.
function TabsWithGuard() {
  const segments = useSegments();
  const isOnboarding = segments[0] === 'onboarding';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: isOnboarding
          ? { display: 'none' }
          : {
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
            {/* W5 Task A 회귀 fix — Tabs 가 app/ 폴더의 모든 라우트를 자동으로
                탭으로 등록하므로 onboarding/* 도 ▼ 탭으로 노출됨. href: null 로
                탭바에서 숨김 (라우트 자체는 그대로 작동, router.replace 만 진입). */}
            <Tabs.Screen name="onboarding/index" options={{ href: null }} />
            <Tabs.Screen name="onboarding/complete" options={{ href: null }} />
            {/* share/[id] 도 동적 라우트로 자동 등록됨 — 탭바에서 숨김
                (Universal Link / 공유 진입 전용, 발견·저장·프로필 3탭만 노출). */}
            <Tabs.Screen name="share/[id]" options={{ href: null }} />
          </Tabs>
  );
}
