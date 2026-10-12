import '@/lib/tracking'; // registers the background location task at startup
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { loadActiveTrip } from '@/lib/storage';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <I18nProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </I18nProvider>
  );
}

function RootNavigator() {
  const { configured, ready, session, deactivated, signOut } = useAuth();
  const { t } = useI18n();

  if (!configured) {
    return (
      <View style={styles.setup}>
        <Text style={styles.setupTitle}>{t('setupNeeded')}</Text>
        <Text style={styles.setupBody}>{t('setupBody')}</Text>
      </View>
    );
  }
  if (!ready) return <View style={styles.blank} />;

  // Deactivated by an admin: block the app, but let a hire that's already running be finished first.
  if (session && deactivated && !loadActiveTrip()) {
    return (
      <View style={styles.setup}>
        <Text style={styles.setupTitle}>{t('deactivatedTitle')}</Text>
        <Text style={styles.setupBody}>{t('accountDeactivated')}</Text>
        <Pressable style={styles.signOut} onPress={() => signOut()}>
          <Text style={styles.signOutText}>{t('signOut')}</Text>
        </Pressable>
      </View>
    );
  }

  const signedIn = session != null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: t('registerTitle') }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="trip/[id]" options={{ title: t('receipt'), presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: colors.bg },
  setup: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 12 },
  setupTitle: { color: colors.link, fontSize: 22, fontWeight: '800' },
  setupBody: { color: colors.text, fontSize: 16, lineHeight: 22 },
  signOut: {
    marginTop: 12,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutText: { color: colors.bad, fontSize: 16, fontWeight: '700' },
});
