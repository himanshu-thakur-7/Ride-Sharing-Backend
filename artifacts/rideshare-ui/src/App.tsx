import { useState, useEffect, useRef, useCallback } from "react";

const BASE = "";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

type RideStatus = "REQUESTED" | "MATCHING" | "OFFER_SENT" | "ACCEPTED" | "CANCELLED";

interface Ride {
  ride_id: string;
  status: RideStatus;
  driver_id?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dest_lat?: number;
  dest_lng?: number;
}

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

const STATUS_COLORS: Record<RideStatus, string> = {
  REQUESTED:  "bg-blue-100 text-blue-800 border-blue-200",
  MATCHING:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  OFFER_SENT: "bg-purple-100 text-purple-800 border-purple-200",
  ACCEPTED:   "bg-green-100 text-green-800 border-green-200",
  CANCELLED:  "bg-red-100 text-red-800 border-red-200",
};

const TERMINAL: RideStatus[] = ["ACCEPTED", "CANCELLED"];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
      {children}
    </label>
  );
}

function Input({
  value, onChange, placeholder, type = "text", "data-testid": testId,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; "data-testid"?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
    />
  );
}

function Button({
  children, onClick, disabled, variant = "primary", "data-testid": testId, className = "",
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "success"; "data-testid"?: string; className?: string;
}) {
  const base = "px-4 py-2 rounded-md text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
  const variants: Record<string, string> = {
    primary:   "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-accent",
    danger:    "bg-destructive text-destructive-foreground hover:opacity-90",
    success:   "bg-green-600 text-white hover:bg-green-700",
  };
  return (
    <button onClick={onClick} disabled={disabled} data-testid={testId}
      className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: RideStatus }) {
  return (
    <span data-testid="status-ride"
      className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  );
}

function Log({ entries }: { entries: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [entries]);
  return (
    <div ref={ref} data-testid="log-panel"
      className="mt-4 h-36 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-xs font-mono text-muted-foreground space-y-0.5">
      {entries.length === 0
        ? <span className="italic">No activity yet.</span>
        : entries.map((e, i) => <div key={i}>{e}</div>)}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-card-border bg-card shadow-sm p-6">
      <h2 className="text-base font-bold text-foreground mb-5">{title}</h2>
      {children}
    </div>
  );
}

// ─── GEOCODER ────────────────────────────────────────────────────────────────

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

function LocationInput({
  label, field, onChange, testIdPrefix,
}: {
  label: string;
  field: LocationField;
  onChange: (f: LocationField) => void;
  testIdPrefix: string;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = async (q: string) => {
    if (q.trim().length < 3) { onChange({ ...field, suggestions: [], searching: false }); return; }
    onChange(f => ({ ...f, searching: true }));
    try {
      const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      const data: GeoResult[] = await res.json();
      onChange(f => ({ ...f, suggestions: data, searching: false }));
    } catch {
      onChange(f => ({ ...f, suggestions: [], searching: false }));
    }
  };

  const handleInput = (val: string) => {
    onChange({ ...field, query: val, resolved: false, lat: "", lng: "", suggestions: [] });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  const pick = (r: GeoResult) => {
    onChange({ query: r.display_name, lat: r.lat, lng: r.lon, resolved: true, searching: false, suggestions: [] });
  };

  return (
    <div className="relative">
      <Label>{label}</Label>
      <div className="relative">
        <input
          type="text"
          value={field.query}
          onChange={e => handleInput(e.target.value)}
          placeholder={`Search for a place…`}
          data-testid={`input-${testIdPrefix}-query`}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground pr-8"
        />
        {field.searching && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs animate-pulse">…</span>
        )}
        {field.resolved && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-600 text-xs font-bold">✓</span>
        )}
      </div>
      {field.suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-popover border border-popover-border rounded-md shadow-md overflow-hidden text-sm">
          {field.suggestions.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => pick(s)}
                data-testid={`suggestion-${testIdPrefix}-${i}`}
                className="w-full text-left px-3 py-2 hover:bg-accent text-popover-foreground text-xs leading-snug cursor-pointer"
              >
                {s.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {field.resolved && (
        <p className="mt-1 text-[10px] font-mono text-muted-foreground">
          {parseFloat(field.lat).toFixed(5)}, {parseFloat(field.lng).toFixed(5)}
        </p>
      )}
    </div>
  );
}

// ─── RIDER APP ────────────────────────────────────────────────────────────────

function RiderApp() {
  const [pickup,  setPickup]  = useState<LocationField>(emptyField());
  const [dest,    setDest]    = useState<LocationField>(emptyField());
  const [loading, setLoading] = useState(false);
  const [ride,    setRide]    = useState<Ride | null>(null);
  const [logs,    setLogs]    = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollRide = useCallback(async (rideId: string) => {
    try {
      const res = await fetch(`${BASE}/rides/${rideId}`);
      if (!res.ok) { addLog(`Poll error: HTTP ${res.status}`); return; }
      const data: Ride = await res.json();
      setRide(data);
      addLog(`Status: ${data.status}${data.driver_id ? ` | Driver: ${data.driver_id}` : ""}`);
      if (TERMINAL.includes(data.status)) {
        stopPolling();
        addLog("Polling stopped — ride reached terminal state.");
      }
    } catch (e) { addLog(`Poll failed: ${(e as Error).message}`); }
  }, [addLog, stopPolling]);

  const requestRide = async () => {
    if (!pickup.resolved || !dest.resolved) {
      addLog("Please resolve both pickup and destination before requesting.");
      return;
    }
    setLoading(true);
    addLog(`Requesting ride from "${pickup.query.split(",")[0]}" → "${dest.query.split(",")[0]}"...`);
    try {
      const res = await fetch(`${BASE}/rides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup_lat: parseFloat(pickup.lat),
          pickup_lng: parseFloat(pickup.lng),
          dest_lat:   parseFloat(dest.lat),
          dest_lng:   parseFloat(dest.lng),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Ride = await res.json();
      setRide(data);
      addLog(`Ride created: ${data.ride_id}`);
      stopPolling();
      pollRef.current = setInterval(() => pollRide(data.ride_id), 2000);
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    } finally { setLoading(false); }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  const canRequest = pickup.resolved && dest.resolved && !loading;

  return (
    <div className="space-y-4">
      <Card title="Request a Ride">
        <div className="space-y-4 mb-5">
          <LocationInput label="Pickup Location" field={pickup} onChange={setPickup} testIdPrefix="pickup" />
          <LocationInput label="Destination" field={dest} onChange={setDest} testIdPrefix="dest" />
        </div>
        <Button onClick={requestRide} disabled={!canRequest} data-testid="button-request-ride">
          {loading ? "Requesting..." : "Request Ride"}
        </Button>
        {(!pickup.resolved || !dest.resolved) && (
          <p className="mt-2 text-xs text-muted-foreground">Search and select both locations to continue.</p>
        )}
      </Card>

      {ride && (
        <Card title="Ride Status">
          <div className="space-y-3">
            <div>
              <Label>Ride ID</Label>
              <p data-testid="text-ride-id" className="text-sm font-mono text-foreground break-all">{ride.ride_id}</p>
            </div>
            <div>
              <Label>Status</Label>
              <StatusBadge status={ride.status} />
            </div>
            {ride.driver_id && (
              <div>
                <Label>Assigned Driver</Label>
                <p data-testid="text-driver-id" className="text-sm font-mono text-foreground">{ride.driver_id}</p>
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

function DriverApp() {
  const [name,        setName]        = useState("");
  const [driverId,    setDriverId]    = useState<string | null>(null);
  const [location,    setLocation]    = useState<LocationField>(emptyField());
  const [rideIdInput, setRideIdInput] = useState("");
  const [ride,        setRide]        = useState<Ride | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [locLoading,  setLocLoading]  = useState(false);
  const [resLoading,  setResLoading]  = useState(false);
  const [logs,        setLogs]        = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const registerDriver = async () => {
    if (!name.trim()) return;
    setLoading(true);
    addLog(`Registering driver "${name}"...`);
    try {
      const res = await fetch(`${BASE}/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const id = data.driver_id ?? data.id ?? data.driverId ?? JSON.stringify(data);
      setDriverId(id);
      addLog(`Registered! Driver ID: ${id}`);
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    } finally { setLoading(false); }
  };

  const updateLocation = async () => {
    if (!driverId || !location.resolved) return;
    setLocLoading(true);
    addLog(`Updating location to "${location.query.split(",")[0]}"...`);
    try {
      const res = await fetch(`${BASE}/drivers/${driverId}/location`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: parseFloat(location.lat), lng: parseFloat(location.lng) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addLog("Location updated.");
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    } finally { setLocLoading(false); }
  };

  const pollRide = useCallback(async (rideId: string) => {
    try {
      const res = await fetch(`${BASE}/rides/${rideId}`);
      if (!res.ok) { addLog(`Poll error: HTTP ${res.status}`); return; }
      const data: Ride = await res.json();
      setRide(data);
      addLog(`Ride status: ${data.status}`);
      if (TERMINAL.includes(data.status)) { stopPolling(); addLog("Polling stopped."); }
    } catch (e) { addLog(`Poll failed: ${(e as Error).message}`); }
  }, [addLog, stopPolling]);

  const startPolling = () => {
    const rideId = rideIdInput.trim();
    if (!rideId) return;
    addLog(`Polling ride ${rideId} every 2s...`);
    stopPolling();
    pollRide(rideId);
    pollRef.current = setInterval(() => pollRide(rideId), 2000);
  };

  const respond = async (accept: boolean) => {
    if (!driverId || !ride) return;
    setResLoading(true);
    addLog(`${accept ? "Accepting" : "Rejecting"} ride ${ride.ride_id}...`);
    try {
      const res = await fetch(`${BASE}/drivers/${driverId}/respond?ride_id=${ride.ride_id}&accept=${accept}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addLog(`Response sent: ${accept ? "ACCEPTED" : "REJECTED"}`);
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    } finally { setResLoading(false); }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  const isOffer = ride && driverId && ride.driver_id === driverId && ride.status === "OFFER_SENT";

  return (
    <div className="space-y-4">
      <Card title="Register as Driver">
        {driverId ? (
          <div className="space-y-1">
            <Label>Driver ID</Label>
            <p data-testid="text-driver-id" className="text-sm font-mono text-foreground break-all">{driverId}</p>
            <p className="text-xs text-muted-foreground mt-1">Registered as <span className="font-semibold">{name}</span></p>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Driver Name</Label>
              <Input value={name} onChange={setName} placeholder="Jane Smith" data-testid="input-driver-name" />
            </div>
            <div className="flex items-end">
              <Button onClick={registerDriver} disabled={loading || !name.trim()} data-testid="button-register-driver">
                {loading ? "Registering..." : "Register Driver"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {driverId && (
        <Card title="Set Current Location">
          <LocationInput
            label="Your Location"
            field={location}
            onChange={setLocation}
            testIdPrefix="driver-loc"
          />
          <div className="mt-4">
            <Button onClick={updateLocation} disabled={locLoading || !location.resolved} variant="secondary" data-testid="button-update-location">
              {locLoading ? "Updating..." : "Update Location"}
            </Button>
            {!location.resolved && (
              <span className="ml-3 text-xs text-muted-foreground">Search and select a location first.</span>
            )}
          </div>
        </Card>
      )}

      {driverId && (
        <Card title="Monitor Ride">
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <Label>Ride ID</Label>
              <Input value={rideIdInput} onChange={setRideIdInput} placeholder="Enter ride_id to monitor" data-testid="input-ride-id" />
            </div>
            <div className="flex items-end">
              <Button onClick={startPolling} variant="secondary" data-testid="button-start-polling">
                Start Polling
              </Button>
            </div>
          </div>

          {ride && (
            <div className="space-y-3 mt-2">
              <div>
                <Label>Status</Label>
                <StatusBadge status={ride.status} />
              </div>
              {ride.driver_id && (
                <div>
                  <Label>Assigned Driver</Label>
                  <p className="text-sm font-mono">{ride.driver_id}</p>
                </div>
              )}
              {isOffer && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">
                    You have been offered this ride!
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => respond(true)} disabled={resLoading} variant="success" data-testid="button-accept-ride">
                      Accept
                    </Button>
                    <Button onClick={() => respond(false)} disabled={resLoading} variant="danger" data-testid="button-reject-ride">
                      Reject
                    </Button>
                  </div>
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

type Tab = "rider" | "driver";

export default function App() {
  const [tab, setTab] = useState<Tab>("rider");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
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
        </div>
      </header>

      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex">
            {(["rider", "driver"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                data-testid={`tab-${t}`}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  tab === t
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "rider" ? "Rider App" : "Driver App"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {tab === "rider" ? <RiderApp /> : <DriverApp />}
      </main>
    </div>
  );
}
