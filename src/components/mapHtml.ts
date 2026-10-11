import { colors } from '@/theme';

/**
 * Shared map page for the WebView maps. Uses MapLibre GL with OpenFreeMap
 * vector tiles: free, no API key, no sign-up, commercial use allowed
 * (https://openfreemap.org). The page exposes window.setData({from, to, route})
 * and posts {lat, lng} back to the app when the map is tapped.
 */
export function mapHtml({ interactive }: { interactive: boolean }): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<style>
  html, body, #m { height: 100%; margin: 0; background: ${colors.surface}; }
  .pin { width: 16px; height: 16px; border-radius: 50%; border: 3px solid #000; box-shadow: 0 0 0 2px rgba(255,255,255,0.6); }
</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script>
var map = new maplibregl.Map({
  container: 'm',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [79.8612, 6.9271],
  zoom: 12,
  interactive: ${interactive},
  attributionControl: { compact: true },
});
var loaded = false, pending = null, markers = [], lastKey = '';

function pin(color, p) {
  var el = document.createElement('div');
  el.className = 'pin';
  el.style.background = color;
  return new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
}

function apply(d) {
  markers.forEach(function (mk) { mk.remove(); });
  markers = [];
  var coords = (d.route || []).map(function (p) { return [p[1], p[0]]; });
  var src = map.getSource('route');
  var geo = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords.length > 1 ? coords : [] } };
  if (src) src.setData(geo);
  else {
    map.addSource('route', { type: 'geojson', data: geo });
    map.addLayer({ id: 'route', type: 'line', source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '${colors.accent}', 'line-width': 6 } });
  }
  if (d.from) markers.push(pin('${colors.go}', d.from));
  if (d.to) markers.push(pin('${colors.stop}', d.to));

  // Re-fit only when the points change, so the driver's own pan/zoom isn't undone.
  var key = JSON.stringify([d.from, d.to, coords.length]);
  if (key === lastKey) return;
  lastKey = key;
  var pts = coords.length > 1 ? coords : [];
  if (d.from) pts = pts.concat([[d.from.lng, d.from.lat]]);
  if (d.to) pts = pts.concat([[d.to.lng, d.to.lat]]);
  if (pts.length > 1) {
    var b = pts.reduce(function (acc, c) { return acc.extend(c); }, new maplibregl.LngLatBounds(pts[0], pts[0]));
    map.fitBounds(b, { padding: 50, maxZoom: 16, duration: 0 });
  } else if (pts.length === 1) {
    map.jumpTo({ center: pts[0], zoom: 15 });
  }
}

window.setData = function (d) { if (loaded) apply(d); else pending = d; };
map.on('load', function () { loaded = true; if (pending) apply(pending); });
map.on('click', function (e) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
});
</script></body></html>`;
}
