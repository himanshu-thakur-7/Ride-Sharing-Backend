from fastapi import FastAPI
from pydantic import BaseModel
import uuid

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