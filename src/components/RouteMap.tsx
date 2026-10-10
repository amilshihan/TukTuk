import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { RoutePoint } from '@/lib/meter';
import { colors, radius } from '@/theme';

/**
 * Route on a real map, drawn with Leaflet in a WebView. No API key is needed:
 * tiles come from CARTO's OpenStreetMap basemap (free for low volume; see README).
 * Needs internet; the receipt still works without it.
 */
export function RouteMap({ route, height = 220 }: { route: RoutePoint[]; height?: number }) {
  const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{height:100%;margin:0;background:${colors.surface}}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var pts = ${JSON.stringify(route)};
var m = L.map('m', { zoomControl: false, dragging: false, touchZoom: false, doubleClickZoom: false, scrollWheelZoom: false, boxZoom: false, keyboard: false });
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19, subdomains: 'abcd',
  attribution: '&copy; OpenStreetMap &copy; CARTO'
}).addTo(m);
var line = L.polyline(pts, { color: '${colors.accent}', weight: 5, opacity: 0.95 }).addTo(m);
L.circleMarker(pts[0], { radius: 7, color: '#000', weight: 2, fillColor: '${colors.go}', fillOpacity: 1 }).addTo(m);
L.circleMarker(pts[pts.length - 1], { radius: 7, color: '#000', weight: 2, fillColor: '${colors.stop}', fillOpacity: 1 }).addTo(m);
m.fitBounds(line.getBounds(), { padding: [28, 28], maxZoom: 17 });
</script></body></html>`;

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        scrollEnabled={false}
        style={styles.web}
        javaScriptEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  web: { backgroundColor: colors.surface },
});
