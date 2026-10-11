import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LanguagePicker, PrimaryButton, TextField } from '@/components/Form';
import { useAuth } from '@/lib/auth';
import { biometricMobile, biometricsAvailable, disableBiometricLogin, unlockSavedLogin } from '@/lib/biometrics';
import { useI18n, type StringKey } from '@/lib/i18n';
import { normalizeMobile } from '@/lib/phone';
import { colors } from '@/theme';

const HERO = require('../../assets/images/home-hero.png');

export default function LoginScreen() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<StringKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedMobile, setSavedMobile] = useState<string | null>(null);

  // If fingerprint / Face ID login is set up on this phone, fill in the number for them.
  useEffect(() => {
    (async () => {
      const [m, ok] = await Promise.all([biometricMobile(), biometricsAvailable()]);
      if (m && ok) {
        setSavedMobile(m);
        setMobile((cur) => cur || m.replace(/^94/, '0'));
      }
    })();
  }, []);

  const typed = normalizeMobile(mobile);
  const canUseBiometrics = savedMobile != null && (mobile.trim() === '' || typed === savedMobile);

  const onBiometricLogin = async () => {
    setError(null);
    const saved = await unlockSavedLogin(t('biometricPrompt'), t('cancel'));
    if (!saved) return;
    setBusy(true);
    const err = await signIn(saved.mobile, saved.password);
    setBusy(false);
    if (err === 'loginFailed') {
      // Password was changed since biometrics was turned on.
      await disableBiometricLogin();
      setSavedMobile(null);
      setError('biometricExpired');
    } else if (err) setError(err);
  };

  const onLogin = async () => {
    const m = normalizeMobile(mobile);
    if (!m) return setError('invalidPhone');
    if (!password) return setError('fillAll');
    setError(null);
    setBusy(true);
    const err = await signIn(m, password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LanguagePicker />
          <Image
            source={HERO}
            style={[styles.hero, { height: ((width - 32) * 560) / 851 }]}
            resizeMode="cover"
            accessibilityLabel="Amil Taxi Meter"
          />
          <View style={styles.header}>
            <Text style={styles.title}>{t('loginTitle')}</Text>
            <Text style={styles.subtitle}>{t('loginSubtitle')}</Text>
          </View>

          <TextField
            label={t('mobile')}
            value={mobile}
            onChangeText={setMobile}
            placeholder="07X XXX XXXX"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
          <TextField
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={onLogin}
          />

          {error ? <Text style={styles.error}>{t(error)}</Text> : null}

          <PrimaryButton title={t('login')} onPress={onLogin} busy={busy} />

          {canUseBiometrics ? (
            <Pressable
              style={({ pressed }) => [styles.bioButton, pressed && { opacity: 0.8 }]}
              onPress={onBiometricLogin}
              disabled={busy}
              accessibilityRole="button"
            >
              <Ionicons name="finger-print" size={28} color={colors.link} />
              <Text style={styles.bioText}>{t('loginWithBiometric')}</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.link} onPress={() => router.push('/register')}>
            <Text style={styles.linkText}>{t('noAccount')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16, flexGrow: 1, justifyContent: 'center' },
  hero: { width: '100%', borderRadius: 22 },
  header: { alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  error: { color: colors.bad, fontSize: 14, textAlign: 'center' },
  bioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  bioText: { color: colors.link, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: colors.link, fontSize: 16, fontWeight: '600' },
});
