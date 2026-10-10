import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { FareRows, Row } from '@/components/FareRows';
import { RouteMap } from '@/components/RouteMap';
import { RouteSketch } from '@/components/RouteSketch';
import { useAuth } from '@/lib/auth';
import { formatDuration, formatKm, formatMoney } from '@/lib/fare';
import { useI18n } from '@/lib/i18n';
import { deleteTrip, getTrip, type StoredTrip } from '@/lib/storage';
import { colors, radius } from '@/theme';

export default function ReceiptScreen() {
  const { t } = useI18n();
  const { driver } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<StoredTrip | null | undefined>(undefined);
  const [cardWidth, setCardWidth] = useState(0);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    getTrip(id).then(setTrip);
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

  const shareText = () => {
    const lines = [
      t('receiptHeader'),
      when(trip.startedAt),
      driver ? `${t('driver')}: ${driver.full_name} · ${driver.vehicle_no}` : null,
      `${t('distance')}: ${formatKm(trip.distanceM)} km`,
      `${t('tripTime')}: ${formatDuration((trip.endedAt - trip.startedAt) / 1000)}`,
      `${t('waitingTime')}: ${formatDuration(trip.waitingSec)}`,
      `${t('total')}: ${money(trip.fare.total)}`,
    ];
    Share.share({ message: lines.filter(Boolean).join('\n') });
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

  const onDelete = () => {
    Alert.alert(t('deleteQ'), t('deleteBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteTrip(trip.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Everything in this card goes into the shared image. */}
      <View ref={cardRef} collapsable={false} style={styles.card} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
        <Text style={styles.brand}>TUK TUK METER</Text>
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
          <Row label={t('ended')} value={when(trip.endedAt)} />
          <Row label={t('distance')} value={`${formatKm(trip.distanceM)} km`} />
          <Row label={t('tripTime')} value={formatDuration((trip.endedAt - trip.startedAt) / 1000)} />
          <Row label={t('waitingTime')} value={formatDuration(trip.waitingSec)} />
        </View>

        <View style={styles.section}>
          <FareRows tariff={trip.tariff} fare={trip.fare} showTotal />
        </View>

        {hasRoute && cardWidth > 0 ? (
          <View style={styles.sketch}>
            <RouteSketch route={trip.route} width={cardWidth - 28} height={140} />
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>{t('route')}</Text>
      {hasRoute ? <RouteMap route={trip.route} /> : <Text style={styles.muted}>{t('noRoute')}</Text>}

      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.primary]} onPress={() => router.back()}>
          <Text style={styles.primaryText}>{t('done')}</Text>
        </Pressable>
        <View style={styles.secondaryRow}>
          <Pressable style={[styles.button, styles.secondary]} onPress={onShare}>
            <Ionicons name="share-social-outline" size={20} color={colors.text} />
            <Text style={styles.secondaryText}>{t('share')}</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={20} color={colors.bad} />
            <Text style={[styles.secondaryText, { color: colors.bad }]}>{t('delete')}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: colors.bg, borderRadius: radius.lg, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border },
  brand: { color: colors.accent, fontWeight: '800', letterSpacing: 3, fontSize: 13, textAlign: 'center' },
  totalBox: {
    backgroundColor: '#000',
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
  sketch: { backgroundColor: colors.surface, borderRadius: radius.md, alignItems: 'center', paddingVertical: 4 },
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
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondary: { flex: 1, backgroundColor: colors.surface },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
