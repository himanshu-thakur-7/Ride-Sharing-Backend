from fastapi import FastAPI
from pydantic import BaseModel
import uuid
import redis
import threading
import time
import boto3
from decimal import Decimal

app = FastAPI()

# ---------------- DynamoDB ----------------

dynamodb = boto3.resource(
    "dynamodb",
    region_name="us-east-1",
    endpoint_url="http://localhost:4566",
    aws_access_key_id="test",
    aws_secret_access_key="test"
)

rides_table = dynamodb.Table("rides")

# ---------------- DynamoDB Helpers ----------------

def save_ride(ride):
    ride = convert_float(ride)
    rides_table.put_item(Item=ride)

def get_ride_db(ride_id):
    res = rides_table.get_item(Key={"id": ride_id})
    item = res.get("Item")
    return convert_decimal(item) if item else None

def update_ride_db(ride_id, updates):
    update_expr = "SET " + ",".join([f"#{k}=:{k}" for k in updates])
    expr_val = {f":{k}": v for k, v in updates.items()}
    expr_names = {f"#{k}": k for k in updates}

    res = rides_table.update_item(
        Key={"id": ride_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_val,
        ExpressionAttributeNames=expr_names,
        ReturnValues="ALL_NEW"
    )

    return convert_decimal(res.get("Attributes"))

# ---------------- Redis ----------------

redis_client = redis.Redis(host="localhost", port=6379, decode_responses=True)

LOCK_TTL = 15
DRIVER_RESPONSE_TIMEOUT = 10
GEO_RADIUS_KM = 5

# ---------------- Drivers (temporary in-memory) ----------------

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


# ---------------- Models ----------------

class Location(BaseModel):
    lat: float
    lng: float

class RideRequest(BaseModel):
    pickup: Location
    destination: Location

class Driver(BaseModel):
    name: str

# ---------------- Locking ----------------

def acquire_driver_lock(driver_id):
    lock_value = str(uuid.uuid4())

    success = redis_client.set(
        f"lock:driver:{driver_id}",
        lock_value,
        nx=True,
        ex=LOCK_TTL
    )

    return lock_value if success else None

def validate_lock(driver_id, lock_value):
    return redis_client.get(f"lock:driver:{driver_id}") == lock_value

def release_lock(driver_id, lock_value):
    if validate_lock(driver_id, lock_value):
        redis_client.delete(f"lock:driver:{driver_id}")

# ---------------- Matching ----------------

def find_nearest_driver(pickup, tried_drivers):
    nearby = redis_client.geosearch(
        "drivers:locations",
        longitude=pickup["lng"],
        latitude=pickup["lat"],
        radius=GEO_RADIUS_KM,
        unit="km"
    )

    for driver_id in nearby:
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
    ride = get_ride_db(ride["id"])
    ride_id = ride["id"]

    update_ride_db(ride_id, {"status": "MATCHING"})

    driver, lock_value = find_nearest_driver(
        ride["pickup"],
        ride["tried_drivers"]
    )

    if not driver:
        update_ride_db(ride_id, {
            "status": "CANCELLED",
            "driver_id": None
        })
        return

    if driver["id"] not in ride["tried_drivers"]:
        ride["tried_drivers"].append(driver["id"])

    driver["status"] = "BUSY"

    update_ride_db(ride_id, {
        "status": "OFFER_SENT",
        "driver_id": driver["id"],
        "lock_value": lock_value,
        "tried_drivers": ride["tried_drivers"]
    })

    threading.Thread(
        target=handle_driver_timeout,
        args=(ride_id, driver["id"], lock_value)
    ).start()

# ---------------- Timeout ----------------

def handle_driver_timeout(ride_id, driver_id, lock_value):
    time.sleep(DRIVER_RESPONSE_TIMEOUT)

    ride = get_ride_db(ride_id)
    driver = drivers.get(driver_id)

    if not ride or not driver:
        return

    if ride["status"] != "OFFER_SENT":
        return

    if ride["driver_id"] != driver_id:
        return

    if not validate_lock(driver_id, lock_value):
        return

    # release lock + free driver
    release_lock(driver_id, lock_value)
    driver["status"] = "AVAILABLE"

    # clear assignment in DB
    update_ride_db(ride_id, {
        "driver_id": None,
        "lock_value": None
    })

    assign_next_driver(ride)

# ---------------- Conversion ----------------

def convert_float(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: convert_float(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_float(v) for v in obj]
    return obj

def convert_decimal(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_decimal(v) for v in obj]
    return obj

# ---------------- Endpoints ----------------

@app.post("/test/reset")
def reset():
    drivers.clear()
    redis_client.flushall()
    return {"message": "reset complete"}

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

    save_ride(ride)
    assign_next_driver(ride)

    return get_ride_db(ride_id)

@app.get("/rides/{ride_id}")
def get_ride(ride_id: str):
    ride = get_ride_db(ride_id)
    return ride if ride else {"error": "Ride not found"}

@app.patch("/rides/{ride_id}")
def update_ride(ride_id: str, status: str):
    ride = get_ride_db(ride_id)

    if not ride:
        return {"error": "Ride not found"}

    if status not in VALID_TRANSITIONS[ride["status"]]:
        return {"error": f"Invalid transition"}

    return update_ride_db(ride_id, {"status": status})

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

@app.post("/drivers/{driver_id}/respond")
def driver_response(driver_id: str, ride_id: str, accept: bool):
    driver = drivers.get(driver_id)
    ride = get_ride_db(ride_id)

    if not driver or not ride:
        return {"error": "Not found"}

    if ride["driver_id"] != driver_id:
        return {"error": "Driver not assigned"}

    if ride["status"] != "OFFER_SENT":
        return {"error": "Not waiting"}

    lock_value = ride.get("lock_value")

    # release lock always
    release_lock(driver_id, lock_value)

    if accept:
        driver["status"] = "BUSY"
        updated = update_ride_db(ride_id, {"status": "ACCEPTED"})
        return {"message": "Accepted", "ride": updated}

    driver["status"] = "AVAILABLE"

    update_ride_db(ride_id, {
        "driver_id": None,
        "lock_value": None
    })

    assign_next_driver(ride)

    return {"message": "Retrying"}