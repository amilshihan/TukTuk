import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { PlannerMap } from '@/components/PlannerMap';
import { estimateFare, formatKm, formatMoney } from '@/lib/fare';
import { useI18n, type StringKey } from '@/lib/i18n';
import { googleMapsLink, planRoute, resolvePlace, searchPlaces, type Place, type PlannedRoute } from '@/lib/routing';
import { loadTariff } from '@/lib/storage';
import { colors, radius } from '@/theme';

type Point = { label: string; lat: number; lng: number; isCurrent?: boolean };
type Field = 'from' | 'to';

export default function PlanScreen() {
  const { t } = useI18n();
  const [from, setFrom] = useState<Point | null>(null);
  const [to, setTo] = useState<Point | null>(null);
  const [locating, setLocating] = useState(true);
  const [editing, setEditing] = useState<Field | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{ query: string; places: Place[] | null; failed: boolean } | null>(null);
  const [planned, setPlanned] = useState<{
    key: string;
    at: number;
    route: PlannedRoute | null;
    error: StringKey | null;
  } | null>(null);

  // Start from where the tuk tuk is now.
  useEffect(() => {
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return;
        const loc =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        setFrom((cur) => cur ?? { label: '', lat: loc.coords.latitude, lng: loc.coords.longitude, isCurrent: true });
      } catch {
        // No fix: the driver can search for the start point instead.
      } finally {
        setLocating(false);
      }
    })();
  }, []);

  // Search as the driver types (debounced). Results are tagged with their query
  // so stale ones are never shown.
  const q = editing ? query.trim() : '';
  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPlaces(q, from ?? undefined)
        .then((places) => !cancelled && setSearch({ query: q, places, failed: false }))
        .catch(() => !cancelled && setSearch({ query: q, places: null, failed: true }));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, from]);
  const current = q.length >= 2 && search?.query === q ? search : null;
  const searching = q.length >= 2 && !current;

  // Plan the route whenever both ends are set; results are tagged with the pair they belong to.
  const routeKey = from && to ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : null;
  useEffect(() => {
    if (!routeKey || !from || !to) return;
    let cancelled = false;
    planRoute(from, to)
      .then((r) => !cancelled && setPlanned({ key: routeKey, at: Date.now(), route: r, error: r ? null : 'noRouteFound' }))
      .catch(() => !cancelled && setPlanned({ key: routeKey, at: Date.now(), route: null, error: 'networkFail' }));
    return () => {
      cancelled = true;
    };
  }, [routeKey, from, to]);
  const plan = routeKey && planned?.key === routeKey ? planned : null;
  const route = plan?.route ?? null;
  const error = plan?.error ?? null;
  const routing = routeKey != null && !plan;
  const pick = async (p: Place) => {
    const field = editing;
    setEditing(null);
    setQuery('');
    Keyboard.dismiss();
    try {
      const { lat, lng } = await resolvePlace(p);
      const point = { label: p.label, lat, lng };
      if (field === 'from') setFrom(point);
      else setTo(point);
    } catch {
      Alert.alert(t('networkFail'));
    }
  };

  const useCurrent = async () => {
    setEditing(null);
    setQuery('');
    Keyboard.dismiss();
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setFrom({ label: '', lat: loc.coords.latitude, lng: loc.coords.longitude, isCurrent: true });
    } catch {}
  };

  const label = (p: Point | null, field: Field) => {
    if (p?.isCurrent) return t('currentLocation');
    if (p) return p.label || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
    if (field === 'from' && locating) return t('locating');
    return field === 'from' ? t('searchFrom') : t('searchTo');
  };

  const tariff = loadTariff();
  const estimate = route && plan ? estimateFare(tariff, route.distanceM, route.durationSec, plan.at, route.trafficDurationSec) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.fields}>
        <FieldRow
          icon="radio-button-on"
          color={colors.go}
          text={label(from, 'from')}
          muted={!from}
          active={editing === 'from'}
          query={query}
          placeholder={t('searchFrom')}
          onOpen={() => {
            setEditing('from');
            setQuery('');
          }}
          onQuery={setQuery}
        />
        <FieldRow
          icon="location"
          color={colors.stop}
          text={label(to, 'to')}
          muted={!to}
          active={editing === 'to'}
          query={query}
          placeholder={t('searchTo')}
          onOpen={() => {
            setEditing('to');
            setQuery('');
          }}
          onQuery={setQuery}
          onClear={to ? () => setTo(null) : undefined}
        />
      </View>

      {editing ? (
        <View style={styles.results}>
          {editing === 'from' ? (
            <Pressable style={styles.result} onPress={useCurrent}>
              <Ionicons name="locate" size={20} color={colors.accent} />
              <Text style={styles.resultTitle}>{t('currentLocation')}</Text>
            </Pressable>
          ) : null}
          {searching ? <ActivityIndicator color={colors.accent} style={{ padding: 16 }} /> : null}
          {current?.failed ? <Text style={styles.empty}>{t('networkFail')}</Text> : null}
          {current?.places && current.places.length === 0 ? <Text style={styles.empty}>{t('noResults')}</Text> : null}
          <FlatList
            data={current?.places ?? []}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(p, i) => `${p.googleId ?? `${p.lat},${p.lng}`},${i}`}
            renderItem={({ item }) => (
              <Pressable style={styles.result} onPress={() => pick(item)}>
                <Ionicons name="location-outline" size={20} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.detail ? (
                    <Text style={styles.resultDetail} numberOfLines={1}>
                      {item.detail}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        </View>
      ) : (
        <>
          <View style={styles.mapWrap}>
            <PlannerMap
              from={from}
              to={to}
              route={route?.points ?? null}
              onTap={(p) => setTo({ label: '', lat: p.lat, lng: p.lng })}
            />
            {!to ? (
              <View style={styles.hint}>
                <Text style={styles.hintText}>{t('tapMapHint')}</Text>
              </View>
            ) : null}
          </View>

          {routing || error || (route && estimate) ? (
            <View style={styles.card}>
              {routing ? (
                <View style={styles.row}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.muted}>{t('routing')}</Text>
                </View>
              ) : error ? (
                <Text style={styles.error}>{t(error)}</Text>
              ) : route && estimate ? (
                <>
                  <Text style={styles.estimateLabel}>{t('estimatedFare')}</Text>
                  <Text style={styles.estimate} adjustsFontSizeToFit numberOfLines={1}>
                    {formatMoney(estimate.low, tariff.currency)} – {formatMoney(estimate.high, tariff.currency).replace(`${tariff.currency} `, '')}
                  </Text>
                  <View style={styles.row}>
                    <Stat label={t('distance')} value={`${formatKm(route.distanceM)} km`} />
                    <Stat label={t('driveTime')} value={t('minutes', { m: Math.max(1, Math.round((route.trafficDurationSec ?? route.durationSec) / 60)) })} />
                  </View>
                  <Text style={styles.note}>{t('estimateNote')}</Text>
                  {from && to ? (
                    <Pressable style={styles.navButton} onPress={() => Linking.openURL(googleMapsLink(from, to))}>
                      <Ionicons name="navigate" size={20} color={colors.accentText} />
                      <Text style={styles.navText}>{t('openInMaps')}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

function FieldRow(props: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  text: string;
  muted: boolean;
  active: boolean;
  query: string;
  placeholder: string;
  onOpen: () => void;
  onQuery: (q: string) => void;
  onClear?: () => void;
}) {
  return (
    <View style={[styles.field, props.active && styles.fieldActive]}>
      <Ionicons name={props.icon} size={18} color={props.color} />
      {props.active ? (
        <TextInput
          style={styles.input}
          value={props.query}
          onChangeText={props.onQuery}
          placeholder={props.placeholder}
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="search"
        />
      ) : (
        <Pressable style={{ flex: 1 }} onPress={props.onOpen}>
          <Text style={[styles.fieldText, props.muted && styles.muted]} numberOfLines={1}>
            {props.text}
          </Text>
        </Pressable>
      )}
      {props.onClear && !props.active ? (
        <Pressable onPress={props.onClear} hitSlop={10}>
          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fields: { padding: 12, gap: 8 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldActive: { borderColor: colors.accent },
  fieldText: { color: colors.text, fontSize: 16 },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 },
  muted: { color: colors.textMuted },
  results: { flex: 1, paddingHorizontal: 12 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultTitle: { color: colors.text, fontSize: 16 },
  resultDetail: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, padding: 16, textAlign: 'center' },
  mapWrap: { flex: 1 },
  hint: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(14,15,18,0.85)',
    borderRadius: radius.sm,
    padding: 10,
  },
  hintText: { color: colors.text, textAlign: 'center', fontSize: 14 },
  card: { backgroundColor: colors.surface, padding: 16, gap: 10, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  estimateLabel: { color: colors.textMuted, letterSpacing: 2, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  estimate: {
    color: colors.accent,
    fontSize: 38,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stat: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, padding: 10 },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 2 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.bad, textAlign: 'center' },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  navText: { color: colors.accentText, fontSize: 16, fontWeight: '800' },
});
