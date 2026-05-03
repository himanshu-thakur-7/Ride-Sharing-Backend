import { useState, useEffect, useRef, useCallback } from "react";

const BASE = "";

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

const STATUS_COLORS: Record<RideStatus, string> = {
  REQUESTED:  "bg-blue-100 text-blue-800 border-blue-200",
  MATCHING:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  OFFER_SENT: "bg-purple-100 text-purple-800 border-purple-200",
  ACCEPTED:   "bg-green-100 text-green-800 border-green-200",
  CANCELLED:  "bg-red-100 text-red-800 border-red-200",
};

const TERMINAL: RideStatus[] = ["ACCEPTED", "CANCELLED"];

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">{children}</label>;
}

function Input({ value, onChange, placeholder, type = "text", "data-testid": testId }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  "data-testid"?: string;
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

function Button({ children, onClick, disabled, variant = "primary", "data-testid": testId, className = "" }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "success";
  "data-testid"?: string;
  className?: string;
}) {
  const base = "px-4 py-2 rounded-md text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
  const variants: Record<string, string> = {
    primary:   "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-accent",
    danger:    "bg-destructive text-destructive-foreground hover:opacity-90",
    success:   "bg-green-600 text-white hover:bg-green-700",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: RideStatus }) {
  return (
    <span
      data-testid="status-ride"
      className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[status]}`}
    >
      {status}
    </span>
  );
}

function Log({ entries }: { entries: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);
  return (
    <div
      ref={ref}
      data-testid="log-panel"
      className="mt-4 h-36 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-xs font-mono text-muted-foreground space-y-0.5"
    >
      {entries.length === 0 ? <span className="italic">No activity yet.</span> : entries.map((e, i) => <div key={i}>{e}</div>)}
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

// ─── RIDER APP ────────────────────────────────────────────────────────────────

function RiderApp() {
  const [pickupLat, setPickupLat] = useState("37.7749");
  const [pickupLng, setPickupLng] = useState("-122.4194");
  const [destLat,   setDestLat]   = useState("37.8044");
  const [destLng,   setDestLng]   = useState("-122.2712");
  const [loading,   setLoading]   = useState(false);
  const [ride,      setRide]      = useState<Ride | null>(null);
  const [logs,      setLogs]      = useState<string[]>([]);
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
    } catch (e) {
      addLog(`Poll failed: ${(e as Error).message}`);
    }
  }, [addLog, stopPolling]);

  const requestRide = async () => {
    setLoading(true);
    addLog("Requesting ride...");
    try {
      const res = await fetch(`${BASE}/rides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup_lat: parseFloat(pickupLat),
          pickup_lng: parseFloat(pickupLng),
          dest_lat:   parseFloat(destLat),
          dest_lng:   parseFloat(destLng),
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  return (
    <div className="space-y-4">
      <Card title="Request a Ride">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <Label>Pickup Latitude</Label>
            <Input value={pickupLat} onChange={setPickupLat} placeholder="37.7749" data-testid="input-pickup-lat" />
          </div>
          <div>
            <Label>Pickup Longitude</Label>
            <Input value={pickupLng} onChange={setPickupLng} placeholder="-122.4194" data-testid="input-pickup-lng" />
          </div>
          <div>
            <Label>Destination Latitude</Label>
            <Input value={destLat} onChange={setDestLat} placeholder="37.8044" data-testid="input-dest-lat" />
          </div>
          <div>
            <Label>Destination Longitude</Label>
            <Input value={destLng} onChange={setDestLng} placeholder="-122.2712" data-testid="input-dest-lng" />
          </div>
        </div>
        <Button onClick={requestRide} disabled={loading} data-testid="button-request-ride">
          {loading ? "Requesting..." : "Request Ride"}
        </Button>
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
  const [name,       setName]       = useState("");
  const [driverId,   setDriverId]   = useState<string | null>(null);
  const [lat,        setLat]        = useState("37.7800");
  const [lng,        setLng]        = useState("-122.4100");
  const [rideIdInput,setRideIdInput]= useState("");
  const [ride,       setRide]       = useState<Ride | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [resLoading, setResLoading] = useState(false);
  const [logs,       setLogs]       = useState<string[]>([]);
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
    } finally {
      setLoading(false);
    }
  };

  const updateLocation = async () => {
    if (!driverId) return;
    setLocLoading(true);
    addLog(`Updating location to (${lat}, ${lng})...`);
    try {
      const res = await fetch(`${BASE}/drivers/${driverId}/location`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: parseFloat(lat), lng: parseFloat(lng) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addLog("Location updated.");
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    } finally {
      setLocLoading(false);
    }
  };

  const pollRide = useCallback(async (rideId: string) => {
    try {
      const res = await fetch(`${BASE}/rides/${rideId}`);
      if (!res.ok) { addLog(`Poll error: HTTP ${res.status}`); return; }
      const data: Ride = await res.json();
      setRide(data);
      addLog(`Ride status: ${data.status}`);
      if (TERMINAL.includes(data.status)) {
        stopPolling();
        addLog("Polling stopped.");
      }
    } catch (e) {
      addLog(`Poll failed: ${(e as Error).message}`);
    }
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
    } finally {
      setResLoading(false);
    }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  const isOffer = ride && driverId && ride.driver_id === driverId && ride.status === "OFFER_SENT";

  return (
    <div className="space-y-4">
      {/* Register */}
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

      {/* Location */}
      {driverId && (
        <Card title="Set Location">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <Label>Latitude</Label>
              <Input value={lat} onChange={setLat} placeholder="37.7800" data-testid="input-lat" />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input value={lng} onChange={setLng} placeholder="-122.4100" data-testid="input-lng" />
            </div>
          </div>
          <Button onClick={updateLocation} disabled={locLoading} variant="secondary" data-testid="button-update-location">
            {locLoading ? "Updating..." : "Update Location"}
          </Button>
        </Card>
      )}

      {/* Poll for ride */}
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
                    <Button
                      onClick={() => respond(true)}
                      disabled={resLoading}
                      variant="success"
                      data-testid="button-accept-ride"
                    >
                      Accept
                    </Button>
                    <Button
                      onClick={() => respond(false)}
                      disabled={resLoading}
                      variant="danger"
                      data-testid="button-reject-ride"
                    >
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
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-primary-foreground" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">Rideshare Demo</h1>
            <p className="text-xs text-muted-foreground">Backend system design showcase</p>
          </div>
        </div>
      </header>

      {/* Tab bar */}
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

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {tab === "rider" ? <RiderApp /> : <DriverApp />}
      </main>
    </div>
  );
}
