import { useEffect, useState, type ReactNode } from 'react';
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
import type { Session } from '@supabase/supabase-js';
import { calculateFare, DEFAULT_TARIFF, formatMoney, type Tariff } from '@/lib/fare';
import { loadTariff, saveTariff } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { syncTrips } from '@/lib/sync';
import { colors, radius } from '@/theme';

type NumericKey = Exclude<keyof Tariff, 'currency'>;

const FIELDS: { key: NumericKey; label: string; hint: string }[] = [
  { key: 'baseFare', label: 'Base fare', hint: 'Charged at the start of every hire' },
  { key: 'baseDistanceKm', label: 'Km included in base fare', hint: 'Usually 1 km' },
  { key: 'perKm', label: 'Rate per km', hint: 'After the included km' },
  { key: 'waitingPerMinute', label: 'Waiting rate per minute', hint: 'While the meter is in waiting mode' },
  { key: 'freeWaitingMinutes', label: 'Free waiting minutes', hint: 'Not charged per hire' },
  { key: 'roundTo', label: 'Round total to nearest', hint: '1 = no rounding, 10 = nearest 10' },
];

export default function SettingsScreen() {
  const [draft, setDraft] = useState<Record<keyof Tariff, string>>(() => toDraft(loadTariff()));

  const parsed = fromDraft(draft);
  const example = parsed ? calculateFare(parsed, 5000, 10 * 60) : null;

  const onSave = () => {
    if (!parsed) {
      Alert.alert('Check the rates', 'Every rate must be a number of 0 or more.');
      return;
    }
    saveTariff(parsed);
    Alert.alert('Saved', 'New rates apply from the next hire.');
  };

  const onReset = () => setDraft(toDraft(DEFAULT_TARIFF));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Fare rates</Text>
        <View style={styles.card}>
          <Field label="Currency" hint="Shown before amounts">
            <TextInput
              style={styles.input}
              value={draft.currency}
              onChangeText={(v) => setDraft({ ...draft, currency: v })}
              autoCapitalize="none"
              maxLength={6}
            />
          </Field>
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <TextInput
                style={styles.input}
                value={draft[f.key]}
                onChangeText={(v) => setDraft({ ...draft, [f.key]: v })}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </Field>
          ))}
        </View>

        {parsed && example ? (
          <Text style={styles.example}>
            Example: 5 km with 10 min waiting = {formatMoney(example.total, parsed.currency)}
          </Text>
        ) : null}

        <Pressable style={[styles.button, styles.primary]} onPress={onSave}>
          <Text style={styles.primaryText}>SAVE RATES</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={onReset}>
          <Text style={styles.linkText}>Reset to defaults</Text>
        </Pressable>

        <Text style={styles.section}>Cloud backup</Text>
        <AccountSection />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AccountSection() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return (
      <View style={styles.card}>
        <Text style={styles.body}>
          Trips are saved on this phone. Cloud backup is not set up in this build. See the README to connect
          Supabase.
        </Text>
      </View>
    );
  }
  const client = supabase;

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) Alert.alert(msg);
    } finally {
      setBusy(false);
    }
  };

  if (session) {
    return (
      <View style={styles.card}>
        <Text style={styles.body}>Signed in as {session.user.email}</Text>
        <Pressable
          style={[styles.button, styles.secondary]}
          disabled={busy}
          onPress={() =>
            run(async () => {
              const r = await syncTrips();
              if ('error' in r) return `Sync failed: ${r.error}`;
              if ('uploaded' in r) return r.uploaded ? `Backed up ${r.uploaded} trip(s)` : 'All trips are backed up';
              return null;
            })
          }
        >
          {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryText}>Back up now</Text>}
        </Pressable>
        <Pressable style={styles.link} onPress={() => client.auth.signOut()}>
          <Text style={[styles.linkText, { color: colors.bad }]}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  const valid = email.includes('@') && password.length >= 6;
  return (
    <View style={styles.card}>
      <Text style={styles.body}>Sign in to back up your trips and see them on another phone.</Text>
      <TextInput
        style={[styles.input, styles.wide]}
        placeholder="Email"
        placeholderTextColor={colors.textMuted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput
        style={[styles.input, styles.wide]}
        placeholder="Password (6+ characters)"
        placeholderTextColor={colors.textMuted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          style={[styles.button, styles.primary, { flex: 1 }, !valid && styles.disabled]}
          disabled={!valid || busy}
          onPress={() =>
            run(async () => {
              const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
              if (error) return error.message;
              syncTrips().catch(() => {});
              return null;
            })
          }
        >
          {busy ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.primaryText}>SIGN IN</Text>}
        </Pressable>
        <Pressable
          style={[styles.button, styles.secondary, { flex: 1 }, !valid && styles.disabled]}
          disabled={!valid || busy}
          onPress={() =>
            run(async () => {
              const { data, error } = await client.auth.signUp({ email: email.trim(), password });
              if (error) return error.message;
              return data.session ? null : 'Check your email to confirm the account, then sign in.';
            })
          }
        >
          <Text style={styles.secondaryText}>Create account</Text>
        </Pressable>
      </View>
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

function toDraft(t: Tariff): Record<keyof Tariff, string> {
  return {
    currency: t.currency,
    baseFare: String(t.baseFare),
    baseDistanceKm: String(t.baseDistanceKm),
    perKm: String(t.perKm),
    waitingPerMinute: String(t.waitingPerMinute),
    freeWaitingMinutes: String(t.freeWaitingMinutes),
    roundTo: String(t.roundTo),
  };
}

function fromDraft(d: Record<keyof Tariff, string>): Tariff | null {
  const out: Partial<Tariff> = { currency: d.currency.trim() || DEFAULT_TARIFF.currency };
  for (const { key } of FIELDS) {
    const n = Number(d[key].replace(',', '.'));
    if (d[key].trim() === '' || !Number.isFinite(n) || n < 0) return null;
    out[key] = n;
  }
  return out as Tariff;
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
  wide: { textAlign: 'left', minWidth: undefined },
  example: { color: colors.textMuted, textAlign: 'center' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  button: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: colors.accentText, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  secondary: { backgroundColor: colors.surfaceRaised },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { color: colors.accent, fontWeight: '600' },
});
