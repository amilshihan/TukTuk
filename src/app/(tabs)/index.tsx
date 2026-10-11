import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useMeter, type GpsStatus } from '@/hooks/useMeter';
import { formatDuration, formatKm, formatMoney, isNightHire } from '@/lib/fare';
import { useI18n, type StringKey } from '@/lib/i18n';
import { FareRows } from '@/components/FareRows';
import { HomeView } from '@/components/HomeView';
import { colors, radius } from '@/theme';

export default function MeterScreen() {
  const { t } = useI18n();
  const meter = useMeter();
  const { trip, fare } = meter;

  const onStart = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const ok = await meter.start();
    if (!ok) {
      Alert.alert(t('locationNeeded'), t('locationNeededBody'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('openSettings'), onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const onEnd = () => {
    if (!trip || !fare) return;
    Alert.alert(t('endHireQ'), t('fareIs', { fare: formatMoney(fare.total, trip.tariff.currency) }), [
      { text: t('keepRunning'), style: 'cancel' },
      {
        text: t('endHire'),
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const done = await meter.finish();
          if (done) router.push({ pathname: '/trip/[id]', params: { id: done.id } });
        },
      },
    ]);
  };

  if (!trip || !fare) return <HomeView onStart={onStart} />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>AMIL TAXI METER</Text>
        <GpsChip status={meter.gps} accuracy={meter.gpsAccuracy} />
      </View>

          <View style={styles.fareBox}>
            <Text style={styles.fareLabel}>{meter.isWaiting ? t('waiting') : t('hired')}</Text>
            <Text style={styles.fare} adjustsFontSizeToFit numberOfLines={1}>
              {formatMoney(fare.total, trip.tariff.currency)}
            </Text>
            {isNightHire(trip.tariff, trip.startedAt) ? (
              <View style={styles.nightBadge}>
                <Ionicons name="moon" size={14} color={colors.accent} />
                <Text style={styles.nightText}>{t('nightActive', { p: trip.tariff.nightPercent })}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.stats}>
            <Stat label={t('distance')} value={formatKm(trip.distanceM)} unit="km" />
            <Stat label={t('tripTime')} value={formatDuration(meter.elapsedSec)} />
            <Stat label={t('waitingTime')} value={formatDuration(meter.waitingSec)} highlight={meter.isWaiting} />
          </View>

          <View style={styles.breakdown}>
            <FareRows tariff={trip.tariff} fare={fare} />
          </View>

          <View style={[styles.modeBar, meter.isWaiting && styles.modeBarWaiting]}>
            <Ionicons
              name={meter.isWaiting ? 'time' : 'navigate'}
              size={22}
              color={meter.isWaiting ? colors.wait : colors.good}
            />
            <Text style={styles.modeText}>
              {meter.isWaiting ? t('modeWaiting') : t('modeMoving', { s: trip.tariff.autoWaitAfterSec })}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onEnd}
              style={({ pressed }) => [styles.button, styles.stopButton, pressed && styles.pressed]}
            >
              <Ionicons name="stop" size={26} color="#fff" />
              <Text style={styles.buttonText}>{t('endHire')}</Text>
            </Pressable>
          </View>
    </SafeAreaView>
  );
}

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit?: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statValue, highlight && { color: colors.wait }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const GPS_LABEL: Record<GpsStatus, { key: StringKey; color: string }> = {
  off: { key: 'gpsOff', color: colors.textMuted },
  searching: { key: 'gpsSearching', color: colors.warn },
  good: { key: 'gps', color: colors.good },
  weak: { key: 'gpsWeak', color: colors.warn },
  denied: { key: 'gpsDenied', color: colors.bad },
};

function GpsChip({ status, accuracy }: { status: GpsStatus; accuracy: number | null }) {
  const { t } = useI18n();
  const { key, color } = GPS_LABEL[status];
  const suffix = status === 'good' && accuracy != null ? ` ±${Math.round(accuracy)}m` : '';
  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.chipText}>
        {t(key)}
        {suffix}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  brand: { color: colors.accent, fontWeight: '800', letterSpacing: 2, fontSize: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'] },

  fareBox: {
    backgroundColor: colors.display,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  fareLabel: { color: colors.textMuted, letterSpacing: 3, fontWeight: '700', fontSize: 13 },
  nightBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  nightText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  fare: {
    color: colors.accent,
    fontSize: 64,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  stats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 },
  statLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statUnit: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },

  breakdown: { marginTop: 14, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 },

  actions: { marginTop: 'auto', gap: 12, paddingBottom: 16 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 68,
    borderRadius: radius.md,
  },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  modeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.good,
  },
  modeBarWaiting: { borderColor: colors.wait },
  modeText: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  stopButton: { backgroundColor: colors.stop },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },

});
