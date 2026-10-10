import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FareRows, Row } from '@/components/FareRows';
import { formatDuration, formatKm, formatMoney } from '@/lib/fare';
import { deleteTrip, getTrip, type StoredTrip } from '@/lib/storage';
import { colors, radius } from '@/theme';

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<StoredTrip | null | undefined>(undefined);

  useEffect(() => {
    getTrip(id).then(setTrip);
  }, [id]);

  if (trip === undefined) return <View style={styles.screen} />;
  if (trip === null) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>Trip not found.</Text>
      </View>
    );
  }

  const money = (n: number) => formatMoney(n, trip.tariff.currency);
  const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const onShare = () => {
    const lines = [
      'Tuk Tuk Meter – Receipt',
      when(trip.startedAt),
      `Distance: ${formatKm(trip.distanceM)} km`,
      `Trip time: ${formatDuration((trip.endedAt - trip.startedAt) / 1000)}`,
      `Waiting: ${formatDuration(trip.waitingSec)}`,
      `Base fare: ${money(trip.fare.baseFare)}`,
      `Distance charge: ${money(trip.fare.distanceCharge)}`,
      `Waiting charge: ${money(trip.fare.waitingCharge)}`,
      `TOTAL: ${money(trip.fare.total)}`,
    ];
    Share.share({ message: lines.join('\n') });
  };

  const onDelete = () => {
    Alert.alert('Delete trip?', 'This removes it from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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
      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>FARE TO COLLECT</Text>
        <Text style={styles.total} adjustsFontSizeToFit numberOfLines={1}>
          {money(trip.fare.total)}
        </Text>
      </View>

      <View style={styles.card}>
        <Row label="Started" value={when(trip.startedAt)} />
        <Row label="Ended" value={when(trip.endedAt)} />
        <Row label="Distance" value={`${formatKm(trip.distanceM)} km`} />
        <Row label="Trip time" value={formatDuration((trip.endedAt - trip.startedAt) / 1000)} />
        <Row label="Waiting time" value={formatDuration(trip.waitingSec)} />
      </View>

      <View style={styles.card}>
        <FareRows tariff={trip.tariff} fare={trip.fare} showTotal />
      </View>

      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.primary]} onPress={() => router.back()}>
          <Text style={styles.primaryText}>DONE</Text>
        </Pressable>
        <View style={styles.secondaryRow}>
          <Pressable style={[styles.button, styles.secondary]} onPress={onShare}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
            <Text style={styles.secondaryText}>Share</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={20} color={colors.bad} />
            <Text style={[styles.secondaryText, { color: colors.bad }]}>Delete</Text>
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
  totalBox: {
    backgroundColor: '#000',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  totalLabel: { color: colors.textMuted, letterSpacing: 3, fontWeight: '700', fontSize: 13 },
  total: { color: colors.accent, fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'] },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 6 },
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
