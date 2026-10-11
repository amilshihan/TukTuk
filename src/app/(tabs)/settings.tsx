import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BiometricToggle } from '@/components/BiometricToggle';
import { LanguagePicker } from '@/components/Form';
import { Row } from '@/components/FareRows';
import { useAuth } from '@/lib/auth';
import { calculateFare, DEFAULT_TARIFF, formatMoney, type Tariff } from '@/lib/fare';
import { useI18n, type StringKey } from '@/lib/i18n';
import { formatMobile } from '@/lib/phone';
import { loadActiveTrip, loadTariff, saveTariff } from '@/lib/storage';
import { syncTrips } from '@/lib/sync';
import { colors, radius } from '@/theme';

type NumericKey = Exclude<keyof Tariff, 'currency'>;
type Draft = Record<keyof Tariff, string>;

const RATE_FIELDS: { key: NumericKey; label: StringKey; hint: StringKey }[] = [
  { key: 'baseFare', label: 'baseFareL', hint: 'baseFareH' },
  { key: 'baseDistanceKm', label: 'baseKmL', hint: 'baseKmH' },
  { key: 'perKm', label: 'perKmL', hint: 'perKmH' },
  { key: 'waitingPerMinute', label: 'waitRateL', hint: 'waitRateH' },
  { key: 'freeWaitingMinutes', label: 'freeWaitL', hint: 'freeWaitH' },
  { key: 'autoWaitAfterSec', label: 'autoWaitL', hint: 'autoWaitH' },
  { key: 'roundTo', label: 'roundL', hint: 'roundH' },
];

const NIGHT_FIELDS: { key: NumericKey; label: StringKey; hint: StringKey }[] = [
  { key: 'nightPercent', label: 'nightPctL', hint: 'nightPctH' },
  { key: 'nightStartHour', label: 'nightStartL', hint: 'nightStartH' },
  { key: 'nightEndHour', label: 'nightEndL', hint: 'nightEndH' },
];

export default function SettingsScreen() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft>(() => toDraft(loadTariff()));
  // Rates can't be changed while a hire is running.
  const [locked, setLocked] = useState(() => loadActiveTrip() != null);

  useFocusEffect(
    useCallback(() => {
      const running = loadActiveTrip() != null;
      setLocked(running);
      // Show the rates actually in force, dropping any unsaved edits.
      if (running) setDraft(toDraft(loadTariff()));
    }, []),
  );

  const parsed = fromDraft(draft);
  const example = parsed ? calculateFare(parsed, 5000, 10 * 60) : null;

  const onSave = () => {
    if (loadActiveTrip()) {
      setLocked(true);
      Alert.alert(t('ratesLocked'));
      return;
    }
    if (!parsed) {
      Alert.alert(t('checkRates'), t('checkRatesBody'));
      return;
    }
    saveTariff(parsed);
    Alert.alert(t('saved'), t('savedBody'));
  };

  const numberField = (f: { key: NumericKey; label: StringKey; hint: StringKey }) => (
    <Field key={f.key} label={t(f.label)} hint={t(f.hint)}>
      <TextInput
        style={styles.input}
        value={draft[f.key]}
        onChangeText={(v) => setDraft({ ...draft, [f.key]: v })}
        editable={!locked}
        keyboardType="decimal-pad"
        selectTextOnFocus
      />
    </Field>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>{t('language')}</Text>
        <LanguagePicker />

        <Text style={styles.section}>{t('fareRates')}</Text>
        {locked ? (
          <View style={styles.lockBanner}>
            <Ionicons name="lock-closed" size={20} color={colors.warn} />
            <Text style={styles.lockText}>{t('ratesLocked')}</Text>
          </View>
        ) : null}
        <View style={[styles.card, locked && styles.lockedCard]}>
          <Field label={t('currency')} hint={t('currencyHint')}>
            <TextInput
              style={styles.input}
              value={draft.currency}
              onChangeText={(v) => setDraft({ ...draft, currency: v })}
              editable={!locked}
              autoCapitalize="none"
              maxLength={6}
            />
          </Field>
          {RATE_FIELDS.map(numberField)}
        </View>

        <Text style={styles.section}>{t('nightRate')}</Text>
        <View style={[styles.card, locked && styles.lockedCard]}>{NIGHT_FIELDS.map(numberField)}</View>

        {parsed && example ? (
          <Text style={styles.example}>{t('example', { fare: formatMoney(example.total, parsed.currency) })}</Text>
        ) : null}

        {locked ? null : (
          <>
            <Pressable style={[styles.button, styles.primary]} onPress={onSave}>
              <Text style={styles.primaryText}>{t('saveRates')}</Text>
            </Pressable>
            <Pressable style={styles.link} onPress={() => setDraft(toDraft(DEFAULT_TARIFF))}>
              <Text style={styles.linkText}>{t('resetDefaults')}</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.section}>{t('account')}</Text>
        <AccountSection />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AccountSection() {
  const { t } = useI18n();
  const { driver, session, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const onBackup = async () => {
    setBusy(true);
    try {
      const r = await syncTrips();
      if ('error' in r) Alert.alert(t('syncFailed', { e: r.error }));
      else if ('uploaded' in r) Alert.alert(r.uploaded ? t('backedUp', { n: r.uploaded }) : t('allBackedUp'));
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = () => {
    // Signing out mid-hire would hide the running meter behind the login screen.
    if (loadActiveTrip()) {
      Alert.alert(t('endHireQ'));
      return;
    }
    Alert.alert(t('signOutQ'), undefined, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('signOut'), style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View style={styles.card}>
      {driver ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.driverName}>{driver.full_name}</Text>
          <Row label={t('mobile')} value={formatMobile(driver.mobile)} />
          <Row label={t('vehicleNo')} value={driver.vehicle_no} />
          <Row label={t('nic')} value={driver.nic} />
          <Row label={t('licenceNo')} value={driver.licence_no} />
        </View>
      ) : session ? (
        <ActivityIndicator color={colors.accent} />
      ) : null}
      <BiometricToggle />
      <Pressable style={[styles.button, styles.secondary]} disabled={busy} onPress={onBackup}>
        {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryText}>{t('backupNow')}</Text>}
      </Pressable>
      <Pressable style={styles.link} onPress={onSignOut}>
        <Text style={[styles.linkText, { color: colors.bad }]}>{t('signOut')}</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      {children}
    </View>
  );
}

function toDraft(t: Tariff): Draft {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, String(v)])) as Draft;
}

function fromDraft(d: Draft): Tariff | null {
  const out: Partial<Tariff> = { currency: d.currency.trim() || DEFAULT_TARIFF.currency };
  for (const { key } of [...RATE_FIELDS, ...NIGHT_FIELDS]) {
    const n = Number(d[key].replace(',', '.'));
    if (d[key].trim() === '' || !Number.isFinite(n) || n < 0) return null;
    out[key] = n;
  }
  const t = out as Tariff;
  if (t.autoWaitAfterSec < 1) return null;
  const hourOk = (h: number) => Number.isInteger(h) && h <= 23;
  if (!hourOk(t.nightStartHour) || !hourOk(t.nightEndHour)) return null;
  return t;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 12 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 96,
    textAlign: 'right',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  example: { color: colors.textMuted, textAlign: 'center' },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF4D1',
    borderRadius: radius.md,
    padding: 12,
  },
  lockText: { color: colors.text, fontSize: 14, flex: 1, lineHeight: 20 },
  lockedCard: { opacity: 0.55 },
  driverName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  button: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: colors.accentText, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  secondary: { backgroundColor: colors.surfaceRaised },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { color: colors.link, fontWeight: '600' },
});
