import { useCallback, useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { formatKm, formatMoney, type Tariff } from '@/lib/fare';
import { useI18n, type Lang } from '@/lib/i18n';
import { loadTariff, summarySince, type DaySummary } from '@/lib/storage';
import { colors, radius, tiles } from '@/theme';

const HERO = require('../../assets/images/home-hero.png');
const MAP = require('../../assets/images/home-map.png');
const COINS = require('../../assets/images/coins.png');

// Artwork sizes, so overlays line up with the pictures at any screen width.
const HERO_RATIO = 560 / 851;
const MAP_RATIO = 475 / 851;
// The settings gear drawn in the hero artwork (centre and diameter, as fractions).
const GEAR = { x: 0.912, y: 0.207, d: 0.11 };

const LOCALE: Record<Lang, string> = { en: 'en-GB', si: 'si-LK', ta: 'ta-LK' };

/** Start screen: hero artwork, today's totals, the big START HIRE button and the current rates. */
export function HomeView({ onStart }: { onStart: () => void }) {
  const { t, lang } = useI18n();
  const { width } = useWindowDimensions();
  const [today, setToday] = useState<DaySummary | null>(null);
  const [tariff, setTariff] = useState<Tariff>(loadTariff);
  const [date, setDate] = useState('');
  const { currency } = tariff;

  // Refresh when returning from Settings or after finishing a hire.
  useFocusEffect(
    useCallback(() => {
      setTariff(loadTariff());
      const now = new Date();
      const day = now.toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'short', year: 'numeric' });
      const weekday = now.toLocaleDateString(LOCALE[lang], { weekday: 'long' });
      setDate(`${day}, ${weekday}`);
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      summarySince(midnight.getTime()).then(setToday).catch(() => {});
    }, [lang]),
  );

  const heroH = width * HERO_RATIO;
  const mapH = width * MAP_RATIO;
  const buttonSize = width * 0.48;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} bounces={false}>
      <View style={{ width, height: heroH }}>
        <Image source={HERO} style={{ width, height: heroH }} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(244,247,251,0)', colors.bg]}
          style={[styles.heroFade, { height: heroH * 0.22 }]}
          pointerEvents="none"
        />
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={t('tabSettings')}
          style={{
            position: 'absolute',
            left: width * GEAR.x - (width * GEAR.d) / 2,
            top: heroH * GEAR.y - (width * GEAR.d) / 2,
            width: width * GEAR.d,
            height: width * GEAR.d,
            borderRadius: width * GEAR.d,
          }}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.today}>{t('today')}</Text>
        <Text style={styles.date}>{date}</Text>

        <View style={styles.stats}>
          <StatCard
            tile={tiles.earnings}
            icon="cash"
            label={t('earnings')}
            value={formatMoney(today?.earnings ?? 0, currency)}
          />
          <StatCard tile={tiles.trips2} icon="git-network" label={t('trips')} value={String(today?.trips ?? 0)} />
          <StatCard
            tile={tiles.distance}
            icon="location"
            label={t('distance')}
            value={formatKm(today?.distanceM ?? 0)}
            unit="km"
          />
        </View>
      </View>

      <ImageBackground source={MAP} style={{ width, height: mapH, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={t('startHire')}
          style={({ pressed }) => [
            styles.start,
            { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 },
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Ionicons name="play" size={buttonSize * 0.26} color={colors.accentText} />
          <Text style={styles.startText} numberOfLines={2} adjustsFontSizeToFit>
            {t('startHire')}
          </Text>
        </Pressable>
      </ImageBackground>

      <View style={styles.section}>
        <View style={styles.rates}>
          <Image source={COINS} style={styles.coins} />
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={styles.ratesText}>
              {t('tariffLine', {
                base: formatMoney(tariff.baseFare, currency),
                km: tariff.baseDistanceKm,
                perKm: tariff.perKm,
                wait: tariff.waitingPerMinute,
              })}
            </Text>
            {tariff.nightPercent > 0 ? (
              <Text style={styles.nightText}>
                {t('nightLine', { p: tariff.nightPercent, from: tariff.nightStartHour, to: tariff.nightEndHour })}
              </Text>
            ) : null}
            <Pressable
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.changeRates, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={18} color={colors.text} />
              <Text style={styles.changeRatesText}>{t('changeRates')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function StatCard({
  tile,
  icon,
  label,
  value,
  unit,
}: {
  tile: { bg: string; icon: string };
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: tile.bg }]}>
      <View style={styles.statHead}>
        <View style={[styles.statIcon, { backgroundColor: tile.icon }]}>
          <Ionicons name={icon} size={16} color="#fff" />
        </View>
        <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 16 },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  section: { paddingHorizontal: 16 },
  today: { color: colors.text, fontSize: 24, fontWeight: '800' },
  date: { color: colors.textMuted, fontSize: 15, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, borderRadius: 18, padding: 12, gap: 8 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statLabel: { color: colors.textMuted, fontSize: 13, flexShrink: 1 },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 15, fontWeight: '700' },
  start: {
    backgroundColor: colors.accent,
    borderWidth: 6,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: '#FFC107',
    shadowOpacity: 0.7,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  startText: {
    color: colors.accentText,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  rates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  coins: { width: 56, height: 58 },
  ratesText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  nightText: { color: colors.textMuted, fontSize: 13 },
  changeRates: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF4D1',
    borderRadius: 999,
    paddingVertical: 8,
  },
  changeRatesText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
