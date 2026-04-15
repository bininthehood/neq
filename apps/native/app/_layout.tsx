import { Tabs } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { colors } from '../lib/tokens';

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
        </Tabs>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
