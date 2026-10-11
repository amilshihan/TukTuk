import { StyleSheet, Text, View } from 'react-native';
import { formatMoney, type FareBreakdown, type Tariff } from '@/lib/fare';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export function FareRows({ tariff, fare, showTotal }: { tariff: Tariff; fare: FareBreakdown; showTotal?: boolean }) {
  const { t } = useI18n();
  const money = (n: number) => formatMoney(n, tariff.currency);
  return (
    <View style={styles.wrap}>
      <Row label={t('baseFare', { km: tariff.baseDistanceKm })} value={money(fare.baseFare)} />
      <Row label={t('distanceAt', { rate: tariff.perKm })} value={money(fare.distanceCharge)} />
      <Row label={t('waitingAt', { rate: tariff.waitingPerMinute })} value={money(fare.waitingCharge)} />
      {fare.nightCharge > 0 ? (
        <Row label={t('nightSurcharge', { p: tariff.nightPercent })} value={money(fare.nightCharge)} />
      ) : null}
      {showTotal ? (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('total')}</Text>
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
  totalValue: { color: colors.link, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
