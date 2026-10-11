import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { LanguagePicker, PrimaryButton, TextField } from '@/components/Form';
import { useAuth } from '@/lib/auth';
import { useI18n, type StringKey } from '@/lib/i18n';
import { normalizeMobile } from '@/lib/phone';
import { colors } from '@/theme';

const NIC_RE = /^(\d{9}[VvXx]|\d{12})$/;

export default function RegisterScreen() {
  const { t } = useI18n();
  const { register } = useAuth();
  const [form, setForm] = useState({
    full_name: '',
    mobile: '',
    address: '',
    nic: '',
    vehicle_no: '',
    licence_no: '',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState<StringKey | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const onRegister = async () => {
    const f = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as typeof form;
    if (Object.values(f).some((v) => v === '')) return setError('fillAll');
    const mobile = normalizeMobile(f.mobile);
    if (!mobile) return setError('invalidPhone');
    if (!NIC_RE.test(f.nic)) return setError('invalidNic');
    if (form.password.length < 6) return setError('passwordShort');
    if (form.password !== form.confirm) return setError('passwordsDontMatch');

    setError(null);
    setBusy(true);
    const err = await register({
      mobile,
      full_name: f.full_name,
      address: f.address,
      nic: f.nic.toUpperCase(),
      vehicle_no: f.vehicle_no.toUpperCase(),
      licence_no: f.licence_no.toUpperCase(),
      password: form.password,
    });
    setBusy(false);
    if (err) setError(err);
    // On success the auth guard swaps to the meter automatically.
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LanguagePicker />
        <Text style={styles.subtitle}>{t('registerSubtitle')}</Text>

        <TextField label={t('fullName')} value={form.full_name} onChangeText={set('full_name')} autoComplete="name" />
        <TextField
          label={t('mobile')}
          value={form.mobile}
          onChangeText={set('mobile')}
          placeholder="07X XXX XXXX"
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <TextField
          label={t('address')}
          value={form.address}
          onChangeText={set('address')}
          multiline
          autoComplete="street-address"
        />
        <TextField
          label={t('nic')}
          value={form.nic}
          onChangeText={set('nic')}
          placeholder="851234567V / 198512345678"
          autoCapitalize="characters"
        />
        <TextField
          label={t('vehicleNo')}
          value={form.vehicle_no}
          onChangeText={set('vehicle_no')}
          placeholder="WP ABC-1234"
          autoCapitalize="characters"
        />
        <TextField
          label={t('licenceNo')}
          value={form.licence_no}
          onChangeText={set('licence_no')}
          autoCapitalize="characters"
        />
        <TextField
          label={`${t('password')} (${t('passwordHint')})`}
          value={form.password}
          onChangeText={set('password')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label={t('confirmPassword')}
          value={form.confirm}
          onChangeText={set('confirm')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />

        {error ? <Text style={styles.error}>{t(error)}</Text> : null}

        <PrimaryButton title={t('register')} onPress={onRegister} busy={busy} />

        <Pressable style={styles.link} onPress={() => router.back()}>
          <Text style={styles.linkText}>{t('haveAccount')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  subtitle: { color: colors.textMuted, fontSize: 15 },
  error: { color: colors.bad, fontSize: 14, textAlign: 'center' },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: colors.link, fontSize: 16, fontWeight: '600' },
});
