import { useEffect } from 'react';
import { Tabs, router, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Pressable } from 'react-native';
import { Text } from '../components/Text';
import * as SplashScreen from 'expo-splash-screen';
import { hasOnboarded } from '../lib/store';
import { colors } from '../lib/tokens';
import { useSync } from '../hooks/useSync';
import PostHogProvider from '../components/PostHogProvider';
import { PersonaProvider } from '../contexts/PersonaContext';
import { ToastProvider } from '../contexts/ToastContext';
import { track } from '../lib/analytics';
import { IconDiscover, IconBookmark, IconSearch, IconMix } from '../components/Icons';
import { emitSearchOpen } from '../lib/search-trigger';

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
  const tint = focused ? colors.aquaText : colors.textMuted;
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

  // Night Pool 폰트(SUIT·Unbounded·Recursive)는 app.json expo-font 플러그인으로 빌드에 내장 —
  // 실행 즉시 등록돼 있어 런타임 useFonts·로딩 게이트가 없다 (2026-05 mount race 이력, 계획 D2).

  // 2026-05-28 mount race fix (build 9 회귀):
  // splash dismiss 는 더 이상 `fontsLoaded` 를 기다리지 않는다. root mount 직후
  // 즉시 hide → Tabs/헤더가 첫 frame 에 a11y tree 에 노출되어 E2E 의 5s 폴 안에
  // 잡힌다 (build 9: 4 regression + hybrid + persona 6 케이스 mount race FAIL 원인).
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
  // 2026-11-27 — 폰트 빌드 내장으로 FOUT 자체가 없다. 게이트를 다시 만들지 말 것.

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
            {/* 2026-08-12 — 하단 4번째 슬롯을 프로필 → 검색으로 교체 (프로필은
                각 화면 헤더 우상단 버튼으로 이동).

                검색은 라우트가 아니라 각 화면이 자체 마운트하는 모달 시트라
                tabPress 를 preventDefault 하고 `emitSearchOpen()` 만 쏜다. 포커스된
                화면이 자기 SearchSheet 를 연다 (lib/search-trigger.ts).
                시트 마운트를 한 곳으로 합치지 않는 이유는 profile.tsx 의 fetch race
                경고 주석 참조.

                search_opened track 은 여기 한 곳에서만 발사 — 기존에는 3화면 헤더
                버튼이 각자 호출했다. 진입 경로가 탭 하나로 합쳐져 중복이 없다. */}
            <Tabs.Screen
              name="search"
              options={{
                tabBarAccessibilityLabel: '검색',
                tabBarIcon: ({ focused }) => (
                  <TabItem
                    icon={({ color }) => <IconSearch size={20} color={color} />}
                    label="검색"
                    focused={focused}
                  />
                ),
              }}
              listeners={{
                tabPress: (e) => {
                  e.preventDefault();
                  track('search_opened');
                  emitSearchOpen();
                },
              }}
            />
            {/* 프로필 — 탭바에서 내리고 헤더 우상단 버튼(router.push)으로 진입.
                라우트 자체는 Tabs 내부에 남아 하단 탭바가 계속 보이고, 다른 탭으로
                바로 나갈 수 있다. */}
            <Tabs.Screen name="profile" options={{ href: null }} />
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
