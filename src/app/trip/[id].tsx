import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { FareRows, Row } from '@/components/FareRows';
import { RouteMap } from '@/components/RouteMap';
import { useAuth } from '@/lib/auth';
import { formatDuration, formatKm, formatMoney } from '@/lib/fare';
import { useI18n } from '@/lib/i18n';
import { normalizeWhatsApp } from '@/lib/phone';
import { getTrip, type StoredTrip } from '@/lib/storage';
import { colors, radius } from '@/theme';

export default function ReceiptScreen() {
  const { t } = useI18n();
  const { driver } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<StoredTrip | null | undefined>(undefined);
  const cardRef = useRef<View>(null);
  const [waNumber, setWaNumber] = useState('');
  const [waError, setWaError] = useState(false);

  useEffect(() => {
    getTrip(id).then(setTrip);
    // Addresses are looked up just after the hire ends; pick them up when they arrive.
    const again = setTimeout(() => getTrip(id).then(setTrip), 10_000);
    return () => clearTimeout(again);
  }, [id]);

  if (trip === undefined) return <View style={styles.screen} />;
  if (trip === null) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>{t('tripNotFound')}</Text>
      </View>
    );
  }

  const money = (n: number) => formatMoney(n, trip.tariff.currency);
  const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const hasRoute = trip.route.length >= 2;

  // The receipt as a message. *text* shows bold in WhatsApp.
  const receiptText = () => {
    const f = trip.fare;
    return [
      `*${t('receiptHeader')}*`,
      when(trip.startedAt),
      driver ? `${t('driver')}: ${driver.full_name} · ${driver.vehicle_no}` : null,
      trip.startAddress ? `${t('from')}: ${trip.startAddress}` : null,
      trip.endAddress ? `${t('to')}: ${trip.endAddress}` : null,
      '',
      `${t('distance')}: ${formatKm(trip.distanceM)} km`,
      `${t('tripTime')}: ${formatDuration((trip.endedAt - trip.startedAt) / 1000)}`,
      `${t('waitingTime')}: ${formatDuration(trip.waitingSec)}`,
      '',
      `${t('baseFare', { km: trip.tariff.baseDistanceKm })}: ${money(f.baseFare)}`,
      `${t('distanceAt', { rate: trip.tariff.perKm })}: ${money(f.distanceCharge)}`,
      `${t('waitingAt', { rate: trip.tariff.waitingPerMinute })}: ${money(f.waitingCharge)}`,
      f.nightCharge > 0 ? `${t('nightSurcharge', { p: trip.tariff.nightPercent })}: ${money(f.nightCharge)}` : null,
      `*${t('total')}: ${money(f.total)}*`,
    ]
      .filter((l) => l != null)
      .join('\n');
  };

  const shareText = () => Share.share({ message: receiptText() });

  // Opens the customer's WhatsApp chat with the receipt typed in; the driver taps send.
  const onWhatsApp = async () => {
    const number = normalizeWhatsApp(waNumber);
    if (!number) {
      setWaError(true);
      return;
    }
    setWaError(false);
    try {
      await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(receiptText())}`);
    } catch {
      Alert.alert(t('whatsAppFailed'));
    }
  };
  // Share the receipt card as a picture (WhatsApp etc.); fall back to text if that fails.
  const onShare = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) return shareText();
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('receipt') });
    } catch {
      shareText();
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Everything in this card goes into the shared image. */}
      <View ref={cardRef} collapsable={false} style={styles.card}>
        <Text style={styles.brand}>AMIL TAXI METER</Text>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>{t('fareToCollect')}</Text>
          <Text style={styles.total} adjustsFontSizeToFit numberOfLines={1}>
            {money(trip.fare.total)}
          </Text>
        </View>

        <View style={styles.section}>
          {driver ? <Row label={t('driver')} value={driver.full_name} /> : null}
          {driver ? <Row label={t('vehicle')} value={driver.vehicle_no} /> : null}
          <Row label={t('started')} value={when(trip.startedAt)} />
          {trip.startAddress ? <Row label={t('from')} value={trip.startAddress} /> : null}
          <Row label={t('ended')} value={when(trip.endedAt)} />
          {trip.endAddress ? <Row label={t('to')} value={trip.endAddress} /> : null}
          <Row label={t('distance')} value={`${formatKm(trip.distanceM)} km`} />
          <Row label={t('tripTime')} value={formatDuration((trip.endedAt - trip.startedAt) / 1000)} />
          <Row label={t('waitingTime')} value={formatDuration(trip.waitingSec)} />
        </View>

        <View style={styles.section}>
          <FareRows tariff={trip.tariff} fare={trip.fare} showTotal />
        </View>
      </View>

      <View style={styles.waCard}>
        <View style={styles.waHead}>
          <Ionicons name="logo-whatsapp" size={22} color={WHATSAPP} />
          <Text style={styles.waTitle}>{t('sendWhatsApp')}</Text>
        </View>
        <View style={styles.waRow}>
          <TextInput
            style={[styles.waInput, waError && styles.waInputError]}
            value={waNumber}
            onChangeText={(v) => {
              setWaNumber(v);
              if (waError) setWaError(false);
            }}
            placeholder="07X XXX XXXX / +44…"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoComplete="tel"
            returnKeyType="send"
            onSubmitEditing={onWhatsApp}
            accessibilityLabel={t('whatsAppNumber')}
          />
          <Pressable
            style={({ pressed }) => [styles.waSend, pressed && { opacity: 0.8 }]}
            onPress={onWhatsApp}
            accessibilityRole="button"
            accessibilityLabel={t('sendWhatsApp')}
          >
            <Ionicons name="send" size={22} color="#fff" />
          </Pressable>
        </View>
        <Text style={[styles.waHint, waError && { color: colors.bad }]}>
          {waError ? t('invalidWhatsApp') : t('whatsAppHint')}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>{t('route')}</Text>
      {hasRoute ? <RouteMap route={trip.route} /> : <Text style={styles.muted}>{t('noRoute')}</Text>}

      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.primary]} onPress={() => router.back()}>
          <Text style={styles.primaryText}>{t('done')}</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondary]} onPress={onShare}>
          <Ionicons name="share-social-outline" size={20} color={colors.text} />
          <Text style={styles.secondaryText}>{t('share')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const WHATSAPP = '#25D366';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  waCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, gap: 10 },
  waHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  waRow: { flexDirection: 'row', gap: 10 },
  waInput: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 17,
    height: 52,
  },
  waInputError: { borderColor: colors.bad },
  waSend: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: WHATSAPP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waHint: { color: colors.textMuted, fontSize: 12 },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border },
  brand: { color: colors.link, fontWeight: '800', letterSpacing: 3, fontSize: 13, textAlign: 'center' },
  totalBox: {
    backgroundColor: colors.display,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  totalLabel: { color: colors.textMuted, letterSpacing: 2, fontWeight: '700', fontSize: 13 },
  total: { color: colors.accent, fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'] },
  section: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 6 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  actions: { gap: 10, marginTop: 6 },
  button: {
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: colors.accentText, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  secondary: { backgroundColor: colors.surface },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
