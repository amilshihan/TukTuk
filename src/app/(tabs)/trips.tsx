import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDuration, formatKm, formatMoney } from '@/lib/fare';
import { useI18n, type Translate } from '@/lib/i18n';
import { listTrips, type StoredTrip } from '@/lib/storage';
import { syncTrips } from '@/lib/sync';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/theme';

export default function TripsScreen() {
  const { t } = useI18n();
  const [trips, setTrips] = useState<StoredTrip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setTrips(await listTrips());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await syncTrips().catch(() => {});
    await load();
    setRefreshing(false);
  };

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={trips.length === 0 ? styles.emptyWrap : styles.content}
      data={trips}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="car-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('noTrips')}</Text>
        </View>
      }
      renderItem={({ item, index }) => {
        const day = dayLabel(item.startedAt, t);
        const showHeader = index === 0 || dayLabel(trips[index - 1].startedAt, t) !== day;
        return (
          <>
            {showHeader ? <Text style={styles.day}>{day}</Text> : null}
            <Pressable
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
              onPress={() => router.push({ pathname: '/trip/[id]', params: { id: item.id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.time}>
                  {timeLabel(item.startedAt)} – {timeLabel(item.endedAt)}
                </Text>
                <Text style={styles.meta}>
                  {formatKm(item.distanceM)} km
                  {item.waitingSec > 0 ? ` · ${t('waited', { t: formatDuration(item.waitingSec) })}` : ''}
                </Text>
              </View>
              <Text style={styles.total}>{formatMoney(item.fare.total, item.tariff.currency)}</Text>
              {supabase ? (
                <Ionicons
                  name={item.synced ? 'cloud-done-outline' : 'cloud-upload-outline'}
                  size={18}
                  color={item.synced ? colors.good : colors.textMuted}
                />
              ) : null}
            </Pressable>
          </>
        );
      }}
    />
  );
}

function dayLabel(ms: number, t: Translate): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('today');
  if (d.toDateString() === yesterday.toDateString()) return t('yesterday');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  empty: { alignItems: 'center', gap: 12 },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
  day: { color: colors.textMuted, fontWeight: '700', marginTop: 8, marginBottom: 2, textTransform: 'uppercase', fontSize: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
  },
  time: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  total: { color: colors.accent, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
