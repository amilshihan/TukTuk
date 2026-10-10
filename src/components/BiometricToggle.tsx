import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import {
  biometricMobile,
  biometricsAvailable,
  confirmWithBiometrics,
  disableBiometricLogin,
  enableBiometricLogin,
} from '@/lib/biometrics';
import { useI18n, type StringKey } from '@/lib/i18n';
import { colors, radius } from '@/theme';

/** Settings row: turn fingerprint / Face ID login on or off for the signed-in driver. */
export function BiometricToggle() {
  const { t } = useI18n();
  const { driver, signIn } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<StringKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    biometricMobile().then((m) => setEnabled(m != null && m === driver?.mobile));
  }, [driver?.mobile]);

  const onToggle = async (on: boolean) => {
    if (!on) {
      await disableBiometricLogin();
      setEnabled(false);
      return;
    }
    if (!(await biometricsAvailable())) {
      Alert.alert(t('biometricLogin'), t('biometricUnavailable'));
      return;
    }
    setPassword('');
    setError(null);
    setAskPassword(true);
  };

  const onConfirm = async () => {
    if (!driver || !password) return;
    setBusy(true);
    // Check the password is right before saving it.
    const err = await signIn(driver.mobile, password);
    if (err) {
      setBusy(false);
      setError(err === 'loginFailed' ? 'wrongPassword' : err);
      return;
    }
    const ok = await confirmWithBiometrics(t('biometricConfirm'), t('cancel'));
    setBusy(false);
    if (!ok) return;
    await enableBiometricLogin(driver.mobile, password);
    setPassword('');
    setAskPassword(false);
    setEnabled(true);
    Alert.alert(t('biometricEnabled'));
  };

  return (
    <>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t('biometricLogin')}</Text>
          <Text style={styles.hint}>{t('biometricHint')}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor={colors.text}
        />
      </View>

      <Modal visible={askPassword} transparent animationType="fade" onRequestClose={() => setAskPassword(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('biometricLogin')}</Text>
            <Text style={styles.hint}>{t('enablePasswordPrompt')}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('password')}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoFocus
              onSubmitEditing={onConfirm}
            />
            {error ? <Text style={styles.error}>{t(error)}</Text> : null}
            <View style={styles.dialogButtons}>
              <Pressable style={[styles.button, styles.secondary]} onPress={() => setAskPassword(false)}>
                <Text style={styles.secondaryText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.primary, (!password || busy) && { opacity: 0.5 }]}
                onPress={onConfirm}
                disabled={!password || busy}
              >
                <Text style={styles.primaryText}>{t('confirm')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, gap: 12 },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: colors.bad, fontSize: 14 },
  dialogButtons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: colors.accentText, fontSize: 16, fontWeight: '800' },
  secondary: { backgroundColor: colors.surfaceRaised },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
