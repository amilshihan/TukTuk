import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useMeter, type GpsStatus } from '@/hooks/useMeter';
import { formatDuration, formatKm, formatMoney, type Tariff } from '@/lib/fare';
import { loadTariff, summarySince, type DaySummary } from '@/lib/storage';
import { FareRows } from '@/components/FareRows';
import { colors, radius } from '@/theme';

export default function MeterScreen() {
  const meter = useMeter();
  const { trip, fare } = meter;

  const onStart = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const ok = await meter.start();
    if (!ok) {
      Alert.alert(
        'Location needed',
        'The meter measures distance with GPS. Please allow location access for Tuk Tuk Meter.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const onEnd = () => {
    if (!trip || !fare) return;
    Alert.alert('End hire?', `Fare: ${formatMoney(fare.total, trip.tariff.currency)}`, [
      { text: 'Keep running', style: 'cancel' },
      {
        text: 'End hire',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const done = await meter.finish();
          if (done) router.push({ pathname: '/trip/[id]', params: { id: done.id } });
        },
      },
    ]);
  };

  const onWaiting = () => {
    Haptics.selectionAsync();
    meter.toggleWaiting();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>TUK TUK METER</Text>
        <GpsChip status={meter.gps} accuracy={meter.gpsAccuracy} />
      </View>

      {trip && fare ? (
        <>
          <View style={styles.fareBox}>
            <Text style={styles.fareLabel}>{meter.isWaiting ? 'WAITING' : 'HIRED'}</Text>
            <Text style={styles.fare} adjustsFontSizeToFit numberOfLines={1}>
              {formatMoney(fare.total, trip.tariff.currency)}
            </Text>
          </View>

          <View style={styles.stats}>
            <Stat label="Distance" value={formatKm(trip.distanceM)} unit="km" />
            <Stat label="Trip time" value={formatDuration(meter.elapsedSec)} />
            <Stat
              label="Waiting"
              value={formatDuration(meter.waitingSec)}
              highlight={meter.isWaiting}
            />
          </View>

          <View style={styles.breakdown}>
            <FareRows tariff={trip.tariff} fare={fare} />
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onWaiting}
              style={({ pressed }) => [
                styles.button,
                meter.isWaiting ? styles.waitOn : styles.waitOff,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name={meter.isWaiting ? 'play' : 'pause'} size={26} color={colors.text} />
              <Text style={styles.buttonText}>{meter.isWaiting ? 'RESUME TRIP' : 'START WAITING'}</Text>
            </Pressable>
            <Pressable
              onPress={onEnd}
              style={({ pressed }) => [styles.button, styles.stopButton, pressed && styles.pressed]}
            >
              <Ionicons name="stop" size={26} color={colors.text} />
              <Text style={styles.buttonText}>END HIRE</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <IdleView onStart={onStart} />
      )}
    </SafeAreaView>
  );
}

function IdleView({ onStart }: { onStart: () => void }) {
  const [today, setToday] = useState<DaySummary | null>(null);
  const [tariff, setTariff] = useState<Tariff>(loadTariff);
  const { currency } = tariff;

  // Refresh when returning from Settings or after finishing a hire.
  useFocusEffect(
    useCallback(() => {
      setTariff(loadTariff());
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      summarySince(midnight.getTime()).then(setToday).catch(() => {});
    }, []),
  );

  return (
    <View style={styles.idle}>
      <View style={styles.todayCard}>
        <Text style={styles.cardTitle}>Today</Text>
        <View style={styles.stats}>
          <Stat label="Earnings" value={formatMoney(today?.earnings ?? 0, currency)} />
          <Stat label="Trips" value={String(today?.trips ?? 0)} />
          <Stat label="Distance" value={formatKm(today?.distanceM ?? 0)} unit="km" />
        </View>
      </View>

      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Start hire"
      >
        <Ionicons name="play" size={56} color={colors.accentText} />
        <Text style={styles.startText}>START HIRE</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/settings')}>
        <Text style={styles.tariffLine}>
          {formatMoney(tariff.baseFare, currency)} first {tariff.baseDistanceKm} km · {tariff.perKm}/km after ·{' '}
          {tariff.waitingPerMinute}/min waiting
        </Text>
        <Text style={styles.tariffEdit}>Change rates</Text>
      </Pressable>
    </View>
  );
}

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit?: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && { color: colors.wait }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const GPS_LABEL: Record<GpsStatus, { text: string; color: string }> = {
  off: { text: 'GPS off', color: colors.textMuted },
  searching: { text: 'Finding GPS…', color: colors.warn },
  good: { text: 'GPS', color: colors.good },
  weak: { text: 'Weak GPS', color: colors.warn },
  denied: { text: 'No location access', color: colors.bad },
};

function GpsChip({ status, accuracy }: { status: GpsStatus; accuracy: number | null }) {
  const { text, color } = GPS_LABEL[status];
  const suffix = status === 'good' && accuracy != null ? ` ±${Math.round(accuracy)}m` : '';
  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.chipText}>
        {text}
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
    backgroundColor: '#000',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  fareLabel: { color: colors.textMuted, letterSpacing: 3, fontWeight: '700', fontSize: 13 },
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
  buttonText: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  waitOff: { backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: colors.wait },
  waitOn: { backgroundColor: colors.wait },
  stopButton: { backgroundColor: colors.stop },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },

  idle: { flex: 1, justifyContent: 'space-between', paddingBottom: 24 },
  todayCard: { marginTop: 4 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  startButton: {
    alignSelf: 'center',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  startText: { color: colors.accentText, fontSize: 24, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  tariffLine: { color: colors.textMuted, textAlign: 'center', fontSize: 13 },
  tariffEdit: { color: colors.accent, textAlign: 'center', fontSize: 13, marginTop: 4, fontWeight: '600' },
});
