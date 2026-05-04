import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";

// Fix Leaflet default marker icons broken by Vite bundling
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const greenIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const redIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const blueIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const BASE = "";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

type RideStatus = "REQUESTED" | "MATCHING" | "OFFER_SENT" | "ACCEPTED" | "CANCELLED";

// Matches the actual backend response shape
interface Ride {
  id: string;
  status: RideStatus;
  driver_id: string | null;
  pickup: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  tried_drivers: string[];
  lock_value: string | null;
}

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface LocationField {
  query: string;
  lat: string;
  lng: string;
  resolved: boolean;
  searching: boolean;
  suggestions: GeoResult[];
}

const emptyField = (): LocationField => ({
  query: "", lat: "", lng: "", resolved: false, searching: false, suggestions: [],
});

const STATUS_COLORS: Record<RideStatus, string> = {
  REQUESTED:  "bg-blue-100 text-blue-800 border-blue-200",
  MATCHING:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  OFFER_SENT: "bg-purple-100 text-purple-800 border-purple-200",
  ACCEPTED:   "bg-green-100 text-green-800 border-green-200",
  CANCELLED:  "bg-red-100 text-red-800 border-red-200",
};

const TERMINAL: RideStatus[] = ["ACCEPTED", "CANCELLED"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder, readOnly, "data-testid": testId }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; "data-testid"?: string;
}) {
  return (
    <input
      type="text" value={value} onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder} readOnly={readOnly} data-testid={testId}
      className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground disabled:opacity-60"
    />
  );
}

function Btn({ children, onClick, disabled, variant = "primary", "data-testid": testId, className = "" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "success"; "data-testid"?: string; className?: string;
}) {
  const base = "px-4 py-2 rounded-md text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
  const v: Record<string, string> = {
    primary:   "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-accent",
    danger:    "bg-destructive text-destructive-foreground hover:opacity-90",
    success:   "bg-green-600 text-white hover:bg-green-700",
  };
  return <button onClick={onClick} disabled={disabled} data-testid={testId} className={`${base} ${v[variant]} ${className}`}>{children}</button>;
}

function StatusBadge({ status }: { status: RideStatus }) {
  return (
    <span data-testid="status-ride" className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  );
}

function Log({ entries }: { entries: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [entries]);
  return (
    <div ref={ref} data-testid="log-panel"
      className="h-32 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-xs font-mono text-muted-foreground space-y-0.5">
      {entries.length === 0 ? <span className="italic">No activity yet.</span> : entries.map((e, i) => <div key={i}>{e}</div>)}
    </div>
  );
}

function Card({ title, children, noPad }: { title?: string; children: React.ReactNode; noPad?: boolean }) {
  return (
    <div className="rounded-xl border border-card-border bg-card shadow-sm overflow-hidden">
      {title && <div className="px-5 pt-4 pb-0"><h2 className="text-sm font-bold text-foreground mb-3">{title}</h2></div>}
      <div className={noPad ? "" : "px-5 pb-4"}>{children}</div>
    </div>
  );
}

// ─── Map ──────────────────────────────────────────────────────────────────────

function MapFlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], 13, { duration: 1 }); }, [lat, lng, map]);
  return null;
}

function MapBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) map.fitBounds(points, { padding: [40, 40], maxZoom: 14, animate: true });
  }, [points, map]);
  return null;
}

interface MapViewProps {
  pickup?: { lat: number; lng: number; label: string };
  destination?: { lat: number; lng: number; label: string };
  driver?: { lat: number; lng: number; label: string };
}

function MapView({ pickup, destination, driver }: MapViewProps) {
  const center: [number, number] =
    pickup     ? [pickup.lat, pickup.lng] :
    driver     ? [driver.lat, driver.lng] :
    destination ? [destination.lat, destination.lng] :
    [20, 0];
  const zoom = pickup || driver || destination ? 13 : 2;

  const line: [number, number][] =
    pickup && destination ? [[pickup.lat, pickup.lng], [destination.lat, destination.lng]] : [];
  const flyTarget = pickup ?? driver ?? destination;
  const hasBoth = !!(pickup && destination);

  return (
    <MapContainer center={center} zoom={zoom} style={{ height: "220px", width: "100%" }} zoomControl scrollWheelZoom>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      {flyTarget && !hasBoth && <MapFlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}
      {hasBoth && <MapBounds points={line} />}
      {line.length === 2 && <Polyline positions={line} color="#6366f1" weight={3} />}
      {pickup && (
        <Marker position={[pickup.lat, pickup.lng]} icon={greenIcon}>
          <Popup>{pickup.label}</Popup>
        </Marker>
      )}
      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={redIcon}>
          <Popup>{destination.label}</Popup>
        </Marker>
      )}
      {driver && (
        <Marker position={[driver.lat, driver.lng]} icon={blueIcon}>
          <Popup>{driver.label}</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}

// ─── Location Autocomplete ─────────────────────────────────────────────────────

function LocationInput({ label, field, onChange, testIdPrefix }: {
  label: string; field: LocationField;
  onChange: (f: LocationField) => void;
  testIdPrefix: string;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    onChange({ ...field, query: q, resolved: false, suggestions: [] });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) return;
    debounceRef.current = setTimeout(async () => {
      onChange(prev => ({ ...prev, searching: true }));
      try {
        const res = await fetch(`${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`, {
          headers: { "Accept-Language": "en" },
        });
        const data: GeoResult[] = await res.json();
        onChange(prev => ({ ...prev, searching: false, suggestions: data }));
      } catch {
        onChange(prev => ({ ...prev, searching: false }));
      }
    }, 400);
  };

  const pick = (r: GeoResult) => {
    onChange({ query: r.display_name, lat: r.lat, lng: r.lon, resolved: true, searching: false, suggestions: [] });
  };

  return (
    <div className="relative">
      <Label>{label}</Label>
      <div className="relative">
        <input type="text" value={field.query} onChange={e => search(e.target.value)}
          data-testid={`input-${testIdPrefix}`} placeholder="Search for a place..."
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground pr-8" />
        {field.searching && (
          <span className="absolute right-2 top-2.5 text-muted-foreground text-xs">…</span>
        )}
        {field.resolved && (
          <span className="absolute right-2 top-2 text-green-500 text-base">✓</span>
        )}
      </div>
      {field.suggestions.length > 0 && (
        <ul className="absolute z-[9999] mt-1 w-full rounded-md border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
          {field.suggestions.map((r, i) => (
            <li key={i} onClick={() => pick(r)} data-testid={`suggestion-${testIdPrefix}-${i}`}
              className="px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer border-b border-border last:border-0 truncate">
              {r.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── RIDER APP ────────────────────────────────────────────────────────────────

interface RiderAppProps {
  onRideCreated: (rideId: string) => void;
}

function RiderApp({ onRideCreated }: RiderAppProps) {
  const [pickup,  setPickup]  = useState<LocationField>(emptyField());
  const [dest,    setDest]    = useState<LocationField>(emptyField());
  const [loading, setLoading] = useState(false);
  const [ride,    setRide]    = useState<Ride | null>(null);
  const [logs,    setLogs]    = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((msg: string) => setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]), []);
  const stopPolling = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []);

  const pollRide = useCallback(async (rideId: string) => {
    try {
      const res = await fetch(`${BASE}/rides/${rideId}`);
      if (!res.ok) { addLog(`Poll error: HTTP ${res.status}`); return; }
      const data: Ride = await res.json();
      setRide(data);
      addLog(`Status: ${data.status}${data.driver_id ? ` | Driver: ${data.driver_id.slice(0, 8)}…` : ""}`);
      if (TERMINAL.includes(data.status)) { stopPolling(); addLog("Polling stopped."); }
    } catch (e) { addLog(`Poll failed: ${(e as Error).message}`); }
  }, [addLog, stopPolling]);

  const requestRide = async () => {
    if (!pickup.resolved || !dest.resolved) { addLog("Resolve both locations first."); return; }
    setLoading(true);
    addLog(`Requesting ride: "${pickup.query.split(",")[0]}" → "${dest.query.split(",")[0]}"…`);
    try {
      const res = await fetch(`${BASE}/rides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Backend expects nested: { pickup: { lat, lng }, destination: { lat, lng } }
        body: JSON.stringify({
          pickup:      { lat: +pickup.lat, lng: +pickup.lng },
          destination: { lat: +dest.lat,   lng: +dest.lng   },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Ride = await res.json();
      setRide(data);
      addLog(`Ride created! ID: ${data.id}`);
      onRideCreated(data.id);
      stopPolling();
      pollRef.current = setInterval(() => pollRide(data.id), 2000);
    } catch (e) { addLog(`Error: ${(e as Error).message}`); }
    finally { setLoading(false); }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  const mapPickup = pickup.resolved ? { lat: +pickup.lat, lng: +pickup.lng, label: pickup.query.split(",")[0] } : undefined;
  const mapDest   = dest.resolved   ? { lat: +dest.lat,   lng: +dest.lng,   label: dest.query.split(",")[0]   } : undefined;

  return (
    <div className="space-y-3 h-full flex flex-col">
      <Card noPad>
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-sm font-bold text-foreground mb-3">Request a Ride</h2>
          <div className="space-y-2 mb-3">
            <LocationInput label="Pickup Location" field={pickup} onChange={setPickup} testIdPrefix="pickup" />
            <LocationInput label="Destination"     field={dest}   onChange={setDest}   testIdPrefix="dest" />
          </div>
          <div className="flex items-center gap-3">
            <Btn onClick={requestRide} disabled={!pickup.resolved || !dest.resolved || loading} data-testid="button-request-ride">
              {loading ? "Requesting…" : "Request Ride"}
            </Btn>
            {(!pickup.resolved || !dest.resolved) && (
              <span className="text-xs text-muted-foreground">Select both locations to continue.</span>
            )}
          </div>
        </div>
        <MapView pickup={mapPickup} destination={mapDest} />
      </Card>

      {ride && (
        <Card title="Ride Status">
          <div className="space-y-2">
            <div>
              <Label>Ride ID</Label>
              <p data-testid="text-ride-id" className="text-xs font-mono text-foreground break-all bg-muted/50 rounded px-2 py-1">{ride.id}</p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <Label>Status</Label>
                <StatusBadge status={ride.status} />
              </div>
            </div>
            {ride.driver_id && (
              <div>
                <Label>Assigned Driver</Label>
                <p data-testid="text-assigned-driver" className="text-xs font-mono truncate">{ride.driver_id}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="Activity Log">
        <Log entries={logs} />
      </Card>
    </div>
  );
}

// ─── DRIVER APP ───────────────────────────────────────────────────────────────

const OFFER_WINDOW_SECS = 15;

interface DriverAppProps {
  sharedRideId: string;
}

function DriverApp({ sharedRideId }: DriverAppProps) {
  const [name,          setName]          = useState("");
  const [driverId,      setDriverId]      = useState<string | null>(null);
  const [location,      setLocation]      = useState<LocationField>(emptyField());
  const [rideIdInput,   setRideIdInput]   = useState("");
  const [ride,          setRide]          = useState<Ride | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [locLoading,    setLocLoading]    = useState(false);
  const [resLoading,    setResLoading]    = useState(false);
  const [logs,          setLogs]          = useState<string[]>([]);
  // Offer latch: stays true for OFFER_WINDOW_SECS regardless of subsequent polls
  const [offerLatched,  setOfferLatched]  = useState(false);
  const [offerCountdown,setOfferCountdown]= useState(0);

  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs so callbacks always see latest values without stale closures
  const driverIdRef     = useRef<string | null>(null);
  const offerLatchedRef = useRef(false);

  useEffect(() => { driverIdRef.current = driverId; }, [driverId]);

  const addLog = useCallback((msg: string) =>
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]), []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const clearOffer = useCallback(() => {
    offerLatchedRef.current = false;
    setOfferLatched(false);
    setOfferCountdown(0);
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const latchOffer = useCallback(() => {
    if (offerLatchedRef.current) return; // already latched
    offerLatchedRef.current = true;
    setOfferLatched(true);
    setOfferCountdown(OFFER_WINDOW_SECS);
    addLog(`🚗 Ride offered to you! You have ${OFFER_WINDOW_SECS}s to respond.`);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setOfferCountdown(c => {
        if (c <= 1) {
          clearOffer();
          addLog("Offer window expired.");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [addLog, clearOffer]);

  const pollRide = useCallback(async (rideId: string) => {
    try {
      const res = await fetch(`${BASE}/rides/${rideId}`);
      if (!res.ok) { addLog(`Poll error: HTTP ${res.status}`); return; }
      const data: Ride = await res.json();
      setRide(data);
      addLog(`Status: ${data.status}${data.driver_id ? ` | Driver: ${data.driver_id.slice(0, 8)}…` : ""}`);
      // Latch offer the moment we see OFFER_SENT for this driver
      if (data.status === "OFFER_SENT" && data.driver_id === driverIdRef.current) {
        latchOffer();
      }
      // Clear latch once ride is terminal
      if (TERMINAL.includes(data.status)) {
        stopPolling();
        clearOffer();
        addLog("Polling stopped.");
      }
    } catch (e) { addLog(`Poll failed: ${(e as Error).message}`); }
  }, [addLog, stopPolling, latchOffer, clearOffer]);

  const startAutoPolling = useCallback((rideId: string) => {
    if (!rideId) return;
    stopPolling();
    pollRide(rideId);
    pollRef.current = setInterval(() => pollRide(rideId), 1000);
  }, [stopPolling, pollRide]);

  // Auto-fill + auto-start polling when rider creates a ride
  useEffect(() => {
    if (!sharedRideId) return;
    setRideIdInput(sharedRideId);
    clearOffer();
    addLog("Ride ID auto-filled from Rider App.");
    if (driverIdRef.current) {
      addLog("Auto-polling started…");
      startAutoPolling(sharedRideId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedRideId]);

  // Also auto-start if driver registers after the ride was already created
  useEffect(() => {
    if (!driverId || !sharedRideId) return;
    addLog("Auto-polling started…");
    startAutoPolling(sharedRideId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId]);

  useEffect(() => () => { stopPolling(); clearOffer(); }, [stopPolling, clearOffer]);

  const registerDriver = async () => {
    if (!name.trim()) return;
    setLoading(true);
    addLog(`Registering "${name}"…`);
    try {
      const res = await fetch(`${BASE}/drivers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const id = data.id ?? data.driver_id ?? data.driverId ?? JSON.stringify(data);
      setDriverId(id);
      addLog(`Registered! ID: ${id.slice(0, 8)}…`);
    } catch (e) { addLog(`Error: ${(e as Error).message}`); }
    finally { setLoading(false); }
  };

  const updateLocation = async () => {
    if (!driverId || !location.resolved) return;
    setLocLoading(true);
    addLog(`Updating location to "${location.query.split(",")[0]}"…`);
    try {
      const res = await fetch(`${BASE}/drivers/${driverId}/location`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: +location.lat, lng: +location.lng }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addLog("Location updated. Now available for matching.");
    } catch (e) { addLog(`Error: ${(e as Error).message}`); }
    finally { setLocLoading(false); }
  };

  const respond = async (accept: boolean) => {
    if (!driverId || !ride) return;
    setResLoading(true);
    addLog(`${accept ? "Accepting" : "Rejecting"} ride…`);
    try {
      const res = await fetch(`${BASE}/drivers/${driverId}/respond?ride_id=${ride.id}&accept=${accept}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      clearOffer();
      addLog(`Response sent: ${accept ? "ACCEPTED" : "REJECTED"}`);
    } catch (e) { addLog(`Error: ${(e as Error).message}`); }
    finally { setResLoading(false); }
  };

  const mapDriver = location.resolved ? { lat: +location.lat, lng: +location.lng, label: location.query.split(",")[0] } : undefined;
  const mapPickup = ride?.pickup      ? { lat: ride.pickup.lat,      lng: ride.pickup.lng,      label: "Pickup"      } : undefined;
  const mapDest   = ride?.destination ? { lat: ride.destination.lat, lng: ride.destination.lng, label: "Destination" } : undefined;

  return (
    <div className="space-y-3 h-full flex flex-col">
      <Card title="Register as Driver">
        {driverId ? (
          <div className="space-y-1">
            <Label>Driver ID</Label>
            <p data-testid="text-driver-id" className="text-xs font-mono text-foreground break-all bg-muted/50 rounded px-2 py-1">{driverId}</p>
            <p className="text-xs text-muted-foreground mt-1">Registered as <span className="font-semibold">{name}</span></p>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Your Name</Label>
              <Input value={name} onChange={setName} placeholder="Jane Smith" data-testid="input-driver-name" />
            </div>
            <div className="flex items-end">
              <Btn onClick={registerDriver} disabled={loading || !name.trim()} data-testid="button-register-driver">
                {loading ? "Registering…" : "Register"}
              </Btn>
            </div>
          </div>
        )}
      </Card>

      {driverId && (
        <Card noPad>
          <div className="px-5 pt-4 pb-3">
            <h2 className="text-sm font-bold text-foreground mb-3">Set Current Location</h2>
            <LocationInput label="Your Location" field={location} onChange={setLocation} testIdPrefix="driver-loc" />
            <div className="mt-3">
              <Btn onClick={updateLocation} disabled={locLoading || !location.resolved} variant="secondary" data-testid="button-update-location">
                {locLoading ? "Updating…" : "Update Location"}
              </Btn>
              {!location.resolved && <span className="ml-3 text-xs text-muted-foreground">Search and select a location first.</span>}
            </div>
          </div>
          <MapView driver={mapDriver} pickup={mapPickup} destination={mapDest} />
        </Card>
      )}

      {/* Offer banner — shown for full OFFER_WINDOW_SECS regardless of poll timing */}
      {offerLatched && (
        <div className="rounded-xl border-2 border-purple-400 bg-purple-50 shadow-md p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-base font-bold text-purple-900">🚗 Ride offered to you!</p>
            <span className={`text-sm font-bold px-2 py-0.5 rounded-full border ${
              offerCountdown <= 5 ? "bg-red-100 text-red-700 border-red-300" : "bg-purple-100 text-purple-700 border-purple-300"
            }`}>
              {offerCountdown}s
            </span>
          </div>
          {ride?.pickup && ride?.destination && (
            <div className="text-xs text-purple-800 mb-3 space-y-0.5">
              <p>📍 Pickup: {ride.pickup.lat.toFixed(4)}, {ride.pickup.lng.toFixed(4)}</p>
              <p>🏁 Dest:   {ride.destination.lat.toFixed(4)}, {ride.destination.lng.toFixed(4)}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Btn onClick={() => respond(true)}  disabled={resLoading} variant="success" data-testid="button-accept-ride">
              {resLoading ? "…" : "✓ Accept"}
            </Btn>
            <Btn onClick={() => respond(false)} disabled={resLoading} variant="danger"  data-testid="button-reject-ride">
              {resLoading ? "…" : "✗ Reject"}
            </Btn>
          </div>
        </div>
      )}

      {driverId && (
        <Card title="Ride Monitor">
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <Label>
                Ride ID{" "}
                {sharedRideId && rideIdInput === sharedRideId
                  ? <span className="text-green-600 normal-case font-normal">(auto-filled · polling every 1s)</span>
                  : null}
              </Label>
              <Input value={rideIdInput} onChange={v => { setRideIdInput(v); }} placeholder="Enter ride_id to monitor" data-testid="input-ride-id" />
            </div>
            <div className="flex items-end">
              <Btn onClick={() => startAutoPolling(rideIdInput.trim())} variant="secondary" data-testid="button-start-polling">Poll</Btn>
            </div>
          </div>

          {ride && (
            <div className="flex items-center gap-4">
              <div><Label>Status</Label><StatusBadge status={ride.status} /></div>
              {ride.driver_id && (
                <div><Label>Assigned Driver</Label>
                  <p className="text-xs font-mono truncate max-w-[140px]">{ride.driver_id}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="Activity Log">
        <Log entries={logs} />
      </Card>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [sharedRideId, setSharedRideId] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-primary-foreground" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">Rideshare</h1>
            <p className="text-xs text-muted-foreground">Backend system design showcase</p>
          </div>
          {sharedRideId && (
            <div className="ml-auto flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-1.5">
              <span className="text-xs text-muted-foreground">Active ride:</span>
              <span className="text-xs font-mono font-semibold text-foreground">{sharedRideId.slice(0, 12)}…</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rider panel */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Rider App</h2>
            </div>
            <RiderApp onRideCreated={setSharedRideId} />
          </div>

          {/* Driver panel */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Driver App</h2>
            </div>
            <DriverApp sharedRideId={sharedRideId} />
          </div>
        </div>
      </main>
    </div>
  );
}
