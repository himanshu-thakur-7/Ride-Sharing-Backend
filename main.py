from fastapi import FastAPI
from pydantic import BaseModel
import uuid

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

class RideRequest(BaseModel):
    pickup:str
    destination:str

class Driver(BaseModel):
    name:str

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
        "pickup": request.pickup,
        "destination": request.destination,
        "status":"REQUESTED",
        "driver_id":None
    }

    rides[ride_id] = ride

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


# api to create driver
@app.post("/drivers")
def create_driver(driver: Driver):
    driver_id = str(uuid.uuid4())

    new_driver = {
        "id" : driver_id,
        "name": driver.name,
        "status":"AVAILABLE"
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