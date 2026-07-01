import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    map.invalidateSize();
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Default Leaflet marker icons don't load correctly with Vite bundling,
// so we point them at the CDN copies instead.
const droneIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function MapView({ telemetry, route }) {
  if (!route) return null;
  const { departure, destination } = route;
  const dronePosition = [telemetry.latitude, telemetry.longitude];

  return (
    <div className="bg-[#10182B] border border-white/10 rounded-2xl p-3 shadow-xl h-[420px]">
      <MapContainer center={dronePosition} zoom={16} className="rounded-xl" style={{ height: "396px" }} scrollWheelZoom={false}>
        <MapResizer />
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[departure.lat, departure.lng]}>
          <Popup>{departure.name} (Launch Point)</Popup>
        </Marker>
        <Marker position={[destination.lat, destination.lng]}>
          <Popup>{destination.name} (Destination)</Popup>
        </Marker>
        <Marker position={dronePosition} icon={droneIcon}>
          <Popup>Drone — Live Position</Popup>
        </Marker>
        <Polyline
          positions={[
            [departure.lat, departure.lng],
            [destination.lat, destination.lng],
          ]}
          pathOptions={{ color: "#38BDF8", dashArray: "6 6", weight: 2 }}
        />
      </MapContainer>
    </div>
  );
}
