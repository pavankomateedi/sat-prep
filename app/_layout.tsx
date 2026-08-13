import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text, fontSize: 17, fontWeight: '600' },
          headerTintColor: colors.accent,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ title: 'Set up' }} />
        {/* Full screen, no back gesture: leaving mid-question would lose the
            response timing the FSRS grade is derived from. */}
        <Stack.Screen
          name="session"
          options={{ title: "Today's session", gestureEnabled: false }}
        />
        <Stack.Screen name="progress" options={{ title: 'Progress' }} />
        <Stack.Screen name="assessment" options={{ title: 'Practice test' }} />
        <Stack.Screen name="drills" options={{ title: 'Timed drills' }} />
        <Stack.Screen name="parent" options={{ title: 'Weekly summary' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="testday" options={{ title: 'Test day' }} />
        <Stack.Screen name="attributions" options={{ title: 'Content sources' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
