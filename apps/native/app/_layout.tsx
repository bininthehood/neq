import { useEffect } from 'react';
import { Tabs, router, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Pressable } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { hasOnboarded } from '../lib/store';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
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
import { ToastProvider } from '../contexts/ToastContext';
import { track } from '../lib/analytics';
import { IconDiscover, IconBookmark, IconUser, IconMix } from '../components/Icons';

SplashScreen.preventAutoHideAsync().catch(() => {});
// 2026-06-01 splash → Welcome (Lottie frame 0) 자연 연결.
// 250ms fade 로 splash 콤마가 사라지는 동안 Welcome 의 Vignette + Lottie 콤마가
// 자리에 떠 시각 점프를 가린다. BRAND-EXTRAS-SPEC.md A "정적 런치스크린의 콤마
// 위치를 흡수 0ms 프레임과 일치 → 이음매 없는 진입" 정합.
// fade duration > Lottie startDelayMs (Welcome 에서 180ms) 라 splash 가 거의 끝나는
// 시점에 Lottie 호흡이 시작 → 페이드 중 콤마 두 개가 겹쳐 보이지 않는다.
SplashScreen.setOptions({ duration: 250, fade: true });

// 2026-05-19 native↔PWA 정합 audit E-1 — 탭 아이콘이 텍스트 이모지(◉♡◎)였던 것을
// 핸드오프 정본 SVG 아이콘으로 교체. `icon` prop 은 (color, active) 를 받아 SVG 를
// 반환하는 렌더 함수 — focused 색 위임.
function TabItem({
  icon,
  label,
  focused,
}: {
  icon: (props: { color: string; active: boolean }) => React.ReactNode;
  label: string;
  focused: boolean;
}) {
  const tint = focused ? colors.accent : colors.textMuted;
  return (
    <View style={{ alignItems: 'center', gap: 3, minWidth: 60 }}>
      {icon({ color: tint, active: focused })}
      <Text
        style={{
          color: tint,
          fontSize: 10,
          fontWeight: focused ? '700' : '500',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// 2026-05-20 — 탭 press 시 active 효과 (사용자 보고: "탭이 잘 작동되지 않는 체감").
// React Navigation v7 의 기본 tabBarButton 은 iOS 에서 highlight 가 거의 없어
// animation:'none' 즉시 전환과 결합 시 사용자가 탭 동작을 인지하지 못함.
// 커스텀 Pressable 로 pressed 상태 시 opacity 0.4 + scale 0.92 적용 → 명확한 시각
// 피드백. tabBarButton 의 props type 은 react-navigation v7 자체 정의라 외부
// noexport 가 일반적 — any 로 받아 children/onPress 등 그대로 위임.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActiveTabBarButton(props: any) {
  const baseStyle = typeof props.style === 'function' ? null : props.style;
  return (
    <Pressable
      {...props}
      style={({ pressed }: { pressed: boolean }) => [
        baseStyle,
        pressed && {
          opacity: 0.4,
          transform: [{ scale: 0.92 }],
        },
      ]}
      android_ripple={null}
    />
  );
}

export default function RootLayout() {
  useSync();

  // useFonts 호출은 유지 — 폰트 자체는 background 로드 후 swap. 반환값은
  // 더 이상 mount gate 에 사용하지 않는다 (2026-05-28 mount race fix).
  useFonts({
    // 기존 Fraunces/Outfit — SwipeCard 의 영화/시리즈 + 별점 라벨 (fonts.data) 유지용
    Fraunces_400Regular,
    // 2026-06-02 — Fraunces_400Regular_Italic 등록.
    // OnboardingStepWelcome 의 메인 카피 '당신의 취향을 발견하세요' 가 디자인 정본
    // (neko-onboarding.jsx StepWelcome heading: `fontFamily: 'Fraunces, serif',
    // fontStyle: 'italic'`) 정합을 위해 추가. 한글은 iOS 시스템 fallback (Apple
    // SD Gothic Neo) + fontStyle:'italic' 자동 syn-italic skew.
    Fraunces_400Regular_Italic,
    Fraunces_700Bold,
    Outfit_400Regular,
    Outfit_600SemiBold,
    // fontsV2 (web 정합) — display + data 신규
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  // 2026-05-28 mount race fix (build 9 회귀):
  // splash dismiss 는 더 이상 `fontsLoaded` 를 기다리지 않는다. root mount 직후
  // 즉시 hide → Tabs/헤더가 첫 frame 에 a11y tree 에 노출되어 E2E 의 5s 폴 안에
  // 잡힌다 (build 9: 4 regression + hybrid + persona 6 케이스 mount race FAIL 원인).
  //
  // 폰트는 background 에서 계속 로드. RN 의 Text 는 미정의 fontFamily 자동 fallback
  // (iOS = San Francisco, Android = Roboto). Instrument Serif / Geist Mono / Fraunces
  // / Outfit 은 도착 시 swap → 사용자가 인지하는 변화는 카드 메타 글꼴이 첫 100~300ms
  // 동안 시스템 폰트로 표시 후 디자인 폰트로 전환 (FOUT 패턴). 모바일 cold start 의
  // 일반적인 폰트 swap 정책 정합.
  //
  // 이전 구조: `if (!fontsLoaded && !fontError) return <View />` 가 PostHogProvider
  // → PersonaProvider → Tabs 전체 mount 를 차단. 폰트 8개 디코드/등록이 Hermes init
  // + Reanimated init 동시 진행 시 5~7s+ 걸려 E2E retry 한도(`tapByLabel` 5s) 초과.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // app_open — root mount 1회 발사. PostHog 미초기화 상태에서도 큐잉되어 안전.
  useEffect(() => {
    track('app_open', { platform: 'native' });
  }, []);

  // W5 Task A 회귀 fix — root 레벨 onboarding 가드.
  // Discover (app/index.tsx) 의 useFocusEffect 가드와 함께 작동. root mount 시
  // hasOnboarded() 평가 후 false 면 즉시 router.replace. setRootGuard 같은 토글
  // 상태 없이 effect 만으로 처리 — 2026-05-28 fix.
  //
  // 2026-05-27 시도 → 2026-05-28 revert:
  // 'pending'/'pass' state + pending 동안 빈 View 차단 패턴을 도입했으나, Provider
  // tree 와 빈 View 사이 전환이 children 전체를 매 cycle 마다 unmount/remount
  // 시키며 무한 loop 유발 (5/28 시뮬레이터 검증: _layout 2292번 mount, 빈 검은
  // 화면 영구 노출). race 차단은 Discover 의 useFocusEffect 만으로 충분.
  useEffect(() => {
    (async () => {
      const ok = await hasOnboarded();
      if (!ok) router.replace('/onboarding');
    })();
  }, []);

  // 2026-05-28 mount race fix — `if (!fontsLoaded) return <View />` 게이트 제거.
  // 위 useEffect 주석 참조. Tabs 즉시 mount → 첫 frame a11y tree 노출 보장.
  // (FOUT 잠깐 — 폰트는 background 에서 swap. layout shift 우려보다 mount race
  // 해소 우선. 폰트 swap 시점 shift 도 RN Text 는 자체 measure 캐시로 1 frame 후
  // 정합 → 시각 영향 최소.)

  return (
    <PostHogProvider>
      <PersonaProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
          {/* initialMetrics — useSafeAreaInsets 측정 race 차단. splash 직후
              SafeAreaView 마진이 늦게 적용되어 콘텐츠가 줄어드는 reflow 방지. */}
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <StatusBar style="light" />
            {/* ToastProvider — SafeAreaProvider 내부 마운트 (toast viewport 가
                useSafeAreaInsets 사용). 탭 화면 전역에서 useToast() 접근 가능. */}
            <ToastProvider>
              <TabsWithGuard />
            </ToastProvider>
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
        // 2026-05-20 (v3) — 시장 표준 정합. 즉시 전환 (no animation).
        //
        // 결정 배경: PWA tabSlideInRight 정합(translateX 40 + opacity 0→1) 을 native
        // BottomTabs 구조에서 그대로 재현하려 했지만, PWA 는 SPA 라 이전 탭 unmount →
        // 새 탭만 슬라이드. native 는 두 탭 모두 mount 상태로 동시 슬라이드 → 사용자
        // 인지 "두 탭이 옆으로 도망가고 옆에서 들어오는" 어색한 모션 + 280ms 지연.
        //
        // 시장 보편 패턴: Twitter / Instagram / TikTok / iOS UITabBarController 기본
        // 모두 즉시 전환 (0ms, no animation). bottom tab 처럼 빈번한 전환에 모션은
        // 인지적 노이즈만 추가.
        //
        // lazy:false 유지 — 가시 3탭 startup pre-mount 로 첫 진입 layout 갭 차단.
        // (별도 Tabs.Screen options 에서 개별 설정 — onboarding/share[id] 는 default lazy.)
        animation: 'none',
        // 2026-05-20 — 탭 press 시 active 효과. 즉시 전환과 결합 시 사용자가 탭
        // 동작을 인지하지 못한다는 보고 → Pressable pressed 상태 opacity+scale.
        tabBarButton: (props) => <ActiveTabBarButton {...props} />,
      }}
    >
            {/* 2026-05-20 — 가시 3탭은 lazy:false 로 startup pre-mount.
                첫 진입 시 layout/font/image 계산이 한 프레임 후 적용되며 콘텐츠가
                "움찔" 하던 결함 차단. onboarding/share[id] 는 default(lazy:true) 유지
                — href:null 숨김 라우트라 startup mount 하면 가드 redirect 와 충돌 →
                검은 화면 회귀. */}
            <Tabs.Screen
              name="index"
              options={{
                lazy: false,
                tabBarAccessibilityLabel: '발견',
                tabBarIcon: ({ focused }) => (
                  <TabItem
                    icon={({ color, active }) => <IconDiscover color={color} active={active} />}
                    label="발견"
                    focused={focused}
                  />
                ),
              }}
            />
            {/* 2026-07-08 Seeded Mix 2차 — Mix 탭 신설 (테마 믹스 제안 → Discover 덱 주입).
                가시 탭 lazy:false 정합 — startup pre-mount 로 첫 진입 layout 갭 차단. */}
            <Tabs.Screen
              name="mix"
              options={{
                lazy: false,
                tabBarAccessibilityLabel: '큐',
                tabBarIcon: ({ focused }) => (
                  <TabItem
                    icon={({ color, active }) => <IconMix color={color} active={active} />}
                    label="큐"
                    focused={focused}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="saved"
              options={{
                lazy: false,
                tabBarAccessibilityLabel: '저장',
                tabBarIcon: ({ focused }) => (
                  <TabItem
                    icon={({ color, active }) => <IconBookmark color={color} active={active} />}
                    label="저장"
                    focused={focused}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                lazy: false,
                tabBarAccessibilityLabel: '프로필',
                tabBarIcon: ({ focused }) => (
                  <TabItem
                    icon={({ color }) => <IconUser color={color} />}
                    label="프로필"
                    focused={focused}
                  />
                ),
              }}
            />
            {/* 2026-05-19 native↔PWA 정합 audit (구조 #1) — onboarding/ 에 `_layout.tsx`
                (<Stack/>) 를 추가해 expo-router 가 onboarding 을 단일 그룹 노드로 합침.
                그 노드 자체에 href:null 을 주어 합성 placeholder 탭(▼) 제거.
                결과: 탭바 = 발견·저장·프로필 3개. (라우트는 router.replace 로 정상 진입.) */}
            <Tabs.Screen name="onboarding" options={{ href: null }} />
            {/* share/[id] 도 동적 라우트로 자동 등록됨 — 탭바에서 숨김
                (Universal Link / 공유 진입 전용, 발견·저장·프로필 3탭만 노출). */}
            <Tabs.Screen name="share/[id]" options={{ href: null }} />
          </Tabs>
  );
}
