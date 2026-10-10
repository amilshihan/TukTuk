import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LanguagePicker, PrimaryButton, TextField } from '@/components/Form';
import { useAuth } from '@/lib/auth';
import { useI18n, type StringKey } from '@/lib/i18n';
import { normalizeMobile } from '@/lib/phone';
import { colors } from '@/theme';

export default function LoginScreen() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<StringKey | null>(null);
  const [busy, setBusy] = useState(false);

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
          <View style={styles.header}>
            <Text style={styles.brand}>TUK TUK METER</Text>
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
  header: { alignItems: 'center', gap: 6, marginVertical: 24 },
  brand: { color: colors.accent, fontWeight: '800', letterSpacing: 3, fontSize: 16 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  error: { color: colors.bad, fontSize: 14, textAlign: 'center' },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
});
