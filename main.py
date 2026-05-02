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

class RideRequest(BaseModel):
    pickup:str
    destination:str


@app.get("/")
def home():
    return {"message":"Uber backend starting...."}

@app.post("/rides")
def create_ride(request: RideRequest):
    ride_id = str(uuid.uuid4())

    ride = {
        "Id" : ride_id,
        "pickup": request.pickup,
        "destination": request.destination,
        "status":"REQUESTED"
    }

    rides[ride_id] = ride

    return ride

@app.get("/rides/{ride_id}")
def get_ride(ride_id:str):
    ride = rides.get(ride_id)

    if not ride:
        return {"error":"Ride not found"}
    
    return ride

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
