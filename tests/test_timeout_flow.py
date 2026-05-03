"""
Test 09: Timeout Flow

- Creates drivers
- Updates locations
- Creates ride
- DOES NOT send driver response
- Verifies auto-retry after timeout
"""

import requests
import time

BASE_URL = "http://localhost:8000"

def create_driver(name):
    return requests.post(
        f"{BASE_URL}/drivers",
        json={"name": name}
    ).json()

def update_location(driver_id, lat, long):
    requests.patch(
        f"{BASE_URL}/drivers/{driver_id}/location",
        json={"lat": lat, "long": long}
    )

def create_ride():
    return requests.post(
        f"{BASE_URL}/rides",
        json={
            "pickup": {"lat": 12.9716, "long": 77.5946},
            "destination": {"lat": 12.9352, "long": 77.6245}
        }
    ).json()

def get_ride(ride_id):
    return requests.get(f"{BASE_URL}/rides/{ride_id}").json()


# ---- TEST FLOW ----

print("\n Creating drivers...")
d1 = create_driver("Driver A")
d2 = create_driver("Driver B")
d3 = create_driver("Driver C")

print("Drivers:", d1["id"], d2["id"], d3["id"])

print("\n Updating locations...")
update_location(d1["id"], 12.9725, 77.5930)  # closest
update_location(d2["id"], 12.9710, 77.6000)
update_location(d3["id"], 12.9650, 77.6200)

time.sleep(1)

print("\n Creating ride...")
ride = create_ride()

ride_id = ride.get("id") or ride.get("Id")
print("Initial ride:", ride)

print("\n Waiting for timeout transitions...\n")

# Observe ride over time
for i in range(4):
    time.sleep(10)

    updated_ride = get_ride(ride_id)
    print(f"After {10*(i+1)} sec:", updated_ride)

    if updated_ride["status"] == "CANCELLED":
        print("\n No drivers left. Ride cancelled.")
        break

    if updated_ride["status"] == "ACCEPTED":
        print("\n Ride accepted (unexpected in timeout test).")
        break

print("\n Timeout test complete.")