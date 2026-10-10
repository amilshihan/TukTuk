import { StyleSheet, Text, View } from 'react-native';
import { formatMoney, type FareBreakdown, type Tariff } from '@/lib/fare';
import { colors } from '@/theme';

export function FareRows({ tariff, fare, showTotal }: { tariff: Tariff; fare: FareBreakdown; showTotal?: boolean }) {
  const money = (n: number) => formatMoney(n, tariff.currency);
  return (
    <View style={styles.wrap}>
      <Row label={`Base fare (first ${tariff.baseDistanceKm} km)`} value={money(fare.baseFare)} />
      <Row label={`Distance @ ${tariff.perKm}/km`} value={money(fare.distanceCharge)} />
      <Row label={`Waiting @ ${tariff.waitingPerMinute}/min`} value={money(fare.waitingCharge)} />
      {showTotal ? (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{money(fare.total)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { color: colors.textMuted, fontSize: 14, flexShrink: 1 },
  value: { color: colors.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  totalValue: { color: colors.accent, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
