import { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';
import type { RoutePoint } from '@/lib/meter';
import { usingGoogle } from '@/lib/routing';
import { colors } from '@/theme';

/**
 * Native map: Google Maps on Android (needs the Google Maps key), Apple Maps
 * on iPhone (free, no key). Without a Google key, Android uses the
 * OpenStreetMap WebView map instead (see useNativeMaps).
 */
export const useNativeMaps = Platform.OS === 'ios' || usingGoogle;

type Point = { lat: number; lng: number };

export function NativeMap({
  from,
  to,
  route,
  onTap,
  interactive = true,
}: {
  from: Point | null;
  to: Point | null;
  route: RoutePoint[] | null;
  onTap?: (p: Point) => void;
  interactive?: boolean;
}) {
  const ref = useRef<MapView>(null);
  const line = useMemo<LatLng[]>(() => (route ?? []).map(([latitude, longitude]) => ({ latitude, longitude })), [route]);

  // Fit the view whenever the points change.
  const fitKey = JSON.stringify([from, to, line.length]);
  useEffect(() => {
    const pts: LatLng[] = [...line];
    if (from) pts.push({ latitude: from.lat, longitude: from.lng });
    if (to) pts.push({ latitude: to.lat, longitude: to.lng });
    if (pts.length > 1) {
      ref.current?.fitToCoordinates(pts, { edgePadding: { top: 60, right: 50, bottom: 60, left: 50 }, animated: true });
    } else if (pts.length === 1) {
      ref.current?.animateCamera({ center: pts[0], zoom: 15 }, { duration: 400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
      userInterfaceStyle="light"
      initialRegion={{ latitude: 6.9271, longitude: 79.8612, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
      showsUserLocation={interactive}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={false}
      pitchEnabled={false}
      onPress={(e) =>
        onTap?.({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })
      }
    >
      {line.length > 1 ? <Polyline coordinates={line} strokeColor={colors.accent} strokeWidth={6} /> : null}
      {from ? <Marker coordinate={{ latitude: from.lat, longitude: from.lng }} pinColor="green" /> : null}
      {to ? <Marker coordinate={{ latitude: to.lat, longitude: to.lng }} pinColor="red" /> : null}
    </MapView>
  );
}
