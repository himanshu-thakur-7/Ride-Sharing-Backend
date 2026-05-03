from fastapi import FastAPI
from pydantic import BaseModel
import uuid
import redis
import threading
import time

app = FastAPI()

# Redis
redis_client = redis.Redis(host="localhost", port=6379, decode_responses=True)

# Constants
LOCK_TTL = 15
DRIVER_RESPONSE_TIMEOUT = 10
GEO_RADIUS_KM = 5

# In-memory storage (temporary)
rides = {}
drivers = {}

# ------------------ STATE MACHINE ------------------

VALID_TRANSITIONS = {
    "REQUESTED": ["MATCHING", "CANCELLED"],
    "MATCHING": ["OFFER_SENT", "CANCELLED"],
    "OFFER_SENT": ["ACCEPTED", "MATCHING", "CANCELLED"],
    "ACCEPTED": ["COMPLETED", "CANCELLED"],
    "COMPLETED": [],
    "CANCELLED": []
}

# ------------------ MODELS ------------------

class Location(BaseModel):
    lat: float
    lng: float

class RideRequest(BaseModel):
    pickup: Location
    destination: Location

class Driver(BaseModel):
    name: str

# ------------------ LOCKING ------------------

def acquire_driver_lock(driver_id):
    lock_value = str(uuid.uuid4())

    success = redis_client.set(
        f"lock:driver:{driver_id}",
        lock_value,
        nx=True,
        ex=LOCK_TTL
    )

    if success:
        return lock_value
    return None

def validate_lock(driver_id, lock_value):
    current = redis_client.get(f"lock:driver:{driver_id}")
    return current == lock_value

# ------------------ MATCHING ------------------

def find_nearest_driver(pickup, tried_drivers):
    nearby_drivers = redis_client.geosearch(
        "drivers:locations",
        longitude=pickup["lng"],
        latitude=pickup["lat"],
        radius=GEO_RADIUS_KM,
        unit="km"
    )

    for driver_id in nearby_drivers:
        if driver_id in tried_drivers:
            continue

        driver = drivers.get(driver_id)
        if not driver or driver["status"] != "AVAILABLE":
            continue

        lock_value = acquire_driver_lock(driver_id)
        if not lock_value:
            continue

        return driver, lock_value

    return None, None


def assign_next_driver(ride):
    ride["status"] = "MATCHING"

    driver, lock_value = find_nearest_driver(
        ride["pickup"],
        ride["tried_drivers"]
    )

    if not driver:
        ride["status"] = "CANCELLED"
        return

    ride["driver_id"] = driver["id"]
    ride["lock_value"] = lock_value
    ride["status"] = "OFFER_SENT"

    driver["status"] = "BUSY"
    ride["tried_drivers"].append(driver["id"])

    # Start timeout
    threading.Thread(
        target=handle_driver_timeout,
        args=(ride["id"], driver["id"], lock_value)
    ).start()

# ------------------ TIMEOUT ------------------

def handle_driver_timeout(ride_id, driver_id, lock_value):
    time.sleep(DRIVER_RESPONSE_TIMEOUT)

    ride = rides.get(ride_id)
    driver = drivers.get(driver_id)

    if not ride or not driver:
        return

    # Validate state
    if ride["status"] != "OFFER_SENT":
        return

    if ride["driver_id"] != driver_id:
        return

    # Validate lock ownership
    if not validate_lock(driver_id, lock_value):
        return

    print(f"⏱ Driver {driver_id} timed out")

    driver["status"] = "AVAILABLE"

    assign_next_driver(ride)

# ------------------ ENDPOINTS ------------------

@app.get("/")
def home():
    return {"message": "Uber backend running"}

@app.post("/rides")
def create_ride(request: RideRequest):
    ride_id = str(uuid.uuid4())

    ride = {
        "id": ride_id,
        "pickup": request.pickup.dict(),
        "destination": request.destination.dict(),
        "status": "REQUESTED",
        "driver_id": None,
        "tried_drivers": [],
        "lock_value": None
    }

    rides[ride_id] = ride

    assign_next_driver(ride)

    return ride

@app.get("/rides/{ride_id}")
def get_ride(ride_id: str):
    return rides.get(ride_id, {"error": "Ride not found"})

@app.patch("/rides/{ride_id}")
def update_ride(ride_id: str, status: str):
    ride = rides.get(ride_id)
    if not ride:
        return {"error": "Ride not found"}

    if status not in VALID_TRANSITIONS[ride["status"]]:
        return {"error": "Invalid transition"}

    ride["status"] = status
    return ride

@app.post("/drivers")
def create_driver(driver: Driver):
    driver_id = str(uuid.uuid4())

    drivers[driver_id] = {
        "id": driver_id,
        "name": driver.name,
        "status": "AVAILABLE"
    }

    return drivers[driver_id]

@app.patch("/drivers/{driver_id}/location")
def update_location(driver_id: str, location: Location):
    if driver_id not in drivers:
        return {"error": "Driver not found"}

    redis_client.geoadd(
        "drivers:locations",
        (location.lng, location.lat, driver_id)
    )

    return {"message": "Location updated"}

@app.get("/drivers")
def get_drivers():
    return drivers

@app.post("/drivers/{driver_id}/respond")
def driver_response(driver_id: str, ride_id: str, accept: bool):
    driver = drivers.get(driver_id)
    ride = rides.get(ride_id)

    if not driver or not ride:
        return {"error": "Not found"}

    if ride["driver_id"] != driver_id:
        return {"error": "Driver not assigned"}

    if ride["status"] != "OFFER_SENT":
        return {"error": "Not waiting for response"}

    if accept:
        ride["status"] = "ACCEPTED"
        return {"message": "Accepted", "ride": ride}

    # Reject
    driver["status"] = "AVAILABLE"

    assign_next_driver(ride)

    return {"message": "Retrying", "ride": ride}