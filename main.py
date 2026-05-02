from fastapi import FastAPI
from pydantic import BaseModel
import uuid
import math
import redis

redis_client = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True
)

VALID_TRANSITIONS = {
    "REQUESTED": ["ACCEPTED","CANCELLED"],
    "ACCEPTED":["COMPLETED","CANCELLED"],
    "COMPLETED":[],
    "CANCELLED":[]
}

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
def find_nearest_driver(pickup):
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
        driver = drivers.get(driver_id)
        if not driver:
            continue
        
        if driver["status"] != "AVAILABLE":
            continue

        return driver
    
    return None

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
        "driver_id":None
    }

    rides[ride_id] = ride

    nearest_driver = find_nearest_driver(ride["pickup"])

    if nearest_driver:
        ride["driver_id"] = nearest_driver["id"]
        ride["status"] = "ACCEPTED"
        nearest_driver["status"] = "BUSY"

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