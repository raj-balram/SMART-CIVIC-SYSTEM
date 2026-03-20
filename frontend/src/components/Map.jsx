import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useEffect, useState } from "react";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const Map = ({ setLocation }) => {
  const [position, setPosition] = useState([20.5937, 78.9629]);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setPosition(coords);
        setLocation({ lat: coords[0], lng: coords[1] });
      },
      () => console.log("Location permission denied")
    );
  }, []);

  return (
    <MapContainer center={position} zoom={13} style={{ height: "300px", width: "100%" }}>
      <TileLayer
        attribution='© OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={position}>
        <Popup>Your Location 📍</Popup>
      </Marker>
    </MapContainer>
  );
};

export default Map;