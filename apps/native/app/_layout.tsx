import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
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
import { colors } from '../lib/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        color: focused ? colors.accent : colors.textMuted,
        fontSize: 13,
        fontWeight: focused ? '700' : '500',
      }}
    >
      {label}
    </Text>
  );
}

export default function RootLayout() {
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

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
            tabBarShowLabel: false,
            sceneStyle: { backgroundColor: colors.bg },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="발견" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="search"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="검색" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="saved"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="저장" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="프로필" focused={focused} />,
            }}
          />
        </Tabs>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
