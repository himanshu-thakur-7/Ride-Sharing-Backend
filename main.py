from fastapi import FastAPI
from pydantic import BaseModel
import uuid
import math
import redis
import threading
import time

redis_client = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True
)

VALID_TRANSITIONS = {
    "REQUESTED": ["MATCHING","CANCELLED"],
    "MATCHING":["ACCEPTED","CANCELLED"],
    "ACCEPTED":["COMPLETED","CANCELLED"],
    "COMPLETED":[],
    "CANCELLED":[]
}
LOCK_TTL = 15
DRIVER_RESPONSE_TIMEOUT = 10

app = FastAPI()

# In memory storage (temporary)
rides = {}
drivers = {}

# Models

class RideRequest(BaseModel):
    pickup:Location
    destination:Location

class Driver(BaseModel):
    name:str

class Location(BaseModel):
    lat:float
    long:float


# helper methods

# calculate distance between location1 and location2
def calculate_distance(loc1, loc2):
    return math.sqrt(
        (loc1["lat"] - loc2["lat"])**2 +
        (loc1["long"] - loc2["long"])**2 
    )

# find nearest driver with distance formula and scanning : v0
def find_nearest_driver_v0(pickup):
    nearest_driver = None
    min_distance = float("inf")

    for driver in drivers.values():
        # if driver is not available continue search
        if driver["status"] != "AVAILABLE":
            continue

        # if driver does not have location continue
        if not driver["location"]:
            continue

        dist = calculate_distance(pickup,driver.get("location"))

        if dist < min_distance:
            min_distance = dist
            nearest_driver = driver
    
    return nearest_driver


# find nearest driver via redis geo search 
def find_nearest_driver(pickup,tried_drivers):
    longitude = pickup["long"]
    latitude = pickup["lat"]

    # search within 5 km radius (distance can be configured later), returns dirver ids sorted by distance
    nearby_drivers = redis_client.geosearch(
        "drivers:locations",
        longitude=longitude,
        latitude=latitude,
        radius=5,
        unit="km"
    )

    for driver_id in nearby_drivers:
        if driver_id in tried_drivers:
            continue
        driver = drivers.get(driver_id)
        if not driver:
            continue
        
        if driver["status"] != "AVAILABLE":
            continue

        # Try acquiring lock
        if not acquire_driver_lock(driver_id):
            continue

        return driver
    
    return None


def acquire_driver_lock(driver_id):
    return redis_client.set(
        f"lock:driver:{driver_id}",
        "locked",
        nx=True,    # only create if does not exist
        ex=LOCK_TTL       # expire in 10 seconds
    )

def handle_driver_timeout(ride_id,driver_id):
    time.sleep(DRIVER_RESPONSE_TIMEOUT) # wait for driver response

    ride = rides.get(ride_id)
    driver = drivers.get(driver_id)

    if not ride or not driver:
        return
    
    # If ride accepted => do nothing
    if ride["status"] != "MATCHING":
        return
    
    # If driver already changed
    if ride["driver_id"] != driver_id:
        return 
    
    print(f"Driver {driver_id} timed out")

    #free driver
    driver["status"] = "AVAILABLE"

    #try next driver
    next_driver = find_nearest_driver(
        ride["pickup"],
        ride["tried_drivers"]
    )

    if next_driver:
        ride["driver_id"] = next_driver["id"]
        ride["tried_drivers"].append(next_driver["id"])
        ride["status"]="MATCHING"

        # start new timeout thread
        threading.Thread(
            target=handle_driver_timeout,
            args=(ride_id,next_driver["id"])
        ).start()

    else:
        ride["status"] = "CANCELLED"


# endpoints
# health endpoint
@app.get("/")
def home():
    return {"message":"Uber backend starting...."}

# api to create a new ride
@app.post("/rides")
def create_ride(request: RideRequest):
    ride_id = str(uuid.uuid4())

    ride = {
        "Id" : ride_id,
        "pickup": request.pickup.dict(),
        "destination": request.destination.dict(),
        "status":"REQUESTED",
        "driver_id":None,
        "tried_drivers":[]
    }

    rides[ride_id] = ride

    nearest_driver = find_nearest_driver(ride["pickup"],ride["tried_drivers"])

    if nearest_driver:
        ride["driver_id"] = nearest_driver["id"]
        ride["status"] = "MATCHING"
        # nearest_driver["status"] = "BUSY"
        ride["tried_drivers"].append(nearest_driver["id"])

    threading.Thread(
        target=handle_driver_timeout,
        args=(ride_id,nearest_driver["id"])
    ).start()
    return ride

# api to get information about a ride
@app.get("/rides/{ride_id}")
def get_ride(ride_id:str):
    ride = rides.get(ride_id)

    if not ride:
        return {"error":"Ride not found"}
    
    return ride

# api to update ride status
@app.patch("/rides/{ride_id}")
def update_ride(ride_id:str, status:str):
    ride = rides.get(ride_id)

    if not ride:
        return {"error":"Ride not found"}
    
    current_status = ride["status"]

    # validate transition
    if status not in VALID_TRANSITIONS[current_status]:
        return {
            "error" : f"Invalid transition from {current_status} to {status}"
        }

    ride["status"] = status

    return ride

@app.get("/drivers")
def get_all_drivers():
    return drivers

# api to create driver
@app.post("/drivers")
def create_driver(driver: Driver):
    driver_id = str(uuid.uuid4())

    new_driver = {
        "id" : driver_id,
        "name": driver.name,
        "status":"AVAILABLE",
        "location": None
    }

    drivers[driver_id] = new_driver

    return new_driver

# endpoint to assign ride to driver
@app.post("/rides/{ride_id}/assign/{driver_id}")
def assign_driver(ride_id:str, driver_id:str):
    ride = rides.get(ride_id)
    driver = drivers.get(driver_id)

    if not ride:
        return {"error":"Ride not found"}
    
    if not driver:
        return {"error":"Driver not found"}
    
    if driver["status"] != "AVAILABLE":
        return {"error":"Driver not available"}
    
    # Assign driver
    ride["driver_id"] = driver_id
    ride["status"] = "ACCEPTED"

    driver["status"] = "BUSY"

    return {
        "ride":ride,
        "driver":driver
    }

# endpoint to update driver location
@app.patch("/drivers/{driver_id}/location")
def update_location(driver_id:str, location: Location):
    driver = drivers.get(driver_id)

    if not driver:
        return {"error":"Driver not found"}
    
    # Naive Solution: save in python dictionary
    # driver["location"] = {
    #     "lat":location.lat,
    #     "long":location.long
    # }

    # Store in redis GEO
    redis_client.geoadd(
        "drivers:locations",
        (location.long, location.lat, driver_id)
    )
    return driver


@app.get("/redis-test")
def redis_test():
    redis_client.set("test","working")
    return {"value":redis_client.get("test")}

# endpoint to register acceptance or rejection of ride request from driver
@app.post("/drivers/{driver_id}/respond")
def driver_response(driver_id:str,ride_id:str,accept:bool):
    driver = drivers.get(driver_id)
    ride = rides.get(ride_id)

    if not driver or not ride:
        return {"error":"Driver or Ride not found"}
    
    if ride["driver_id"] != driver_id:
        return {"error":"Driver not assigned to this ride"}
    
    if ride["status"] != "MATCHING":
        return {"error":"Ride not in matching state"}
    
    if accept:
        ride["status"] = "ACCEPTED"
        driver["status"] = "BUSY"
        return {"message":"Ride accepted","ride":ride}
    
    else:
        # reject the ride
        driver["status"] = "AVAILABLE"
        
        # try next driver
        next_driver = find_nearest_driver(
            ride["pickup"],ride["tried_drivers"]
        )

        if next_driver:
            ride["driver_id"] = next_driver["id"]
            ride["tried_drivers"].append(next_driver["id"])
            ride["status"] = "MATCHING"
            threading.Thread(
                target=handle_driver_timeout,
                args=(ride_id,next_driver["id"])
            ).start()
            return {"message":"Trying next driver","ride":ride}
        
        else:
            ride["status"] = "CANCELLED"
            return {"message":"No drivers available","ride":ride}