"""
Test: DynamoDB + Matching Flow

- Setup drivers
- Create ride
- Observe assignment
- Verify persistence
"""

import requests
import time

BASE_URL = "http://localhost:8000"


def setup_drivers():
    drivers = []
    for name in ["A", "B"]:
        d = requests.post(
            f"{BASE_URL}/drivers",
            json={"name": f"Driver {name}"}
        ).json()

        drivers.append(d)

        requests.patch(
            f"{BASE_URL}/drivers/{d['id']}/location",
            json={"lat": 12.9716, "lng": 77.5946}
        )

    return drivers


def create_ride():
    return requests.post(
        f"{BASE_URL}/rides",
        json={
            "pickup": {"lat": 12.9716, "lng": 77.5946},
            "destination": {"lat": 12.9352, "lng": 77.6245}
        }
    ).json()


def get_ride(ride_id):
    return requests.get(f"{BASE_URL}/rides/{ride_id}").json()


# ---- TEST FLOW ----

setup_drivers()

print("Creating ride...")
ride = create_ride()
ride_id = ride["id"]

print("Created:", ride)

time.sleep(1)

print("Fetching ride from DB...")
ride_from_db = get_ride(ride_id)
print("Fetched:", ride_from_db)

print("Waiting for timeout flow...")
time.sleep(22)

final = get_ride(ride_id)

print("Final ride state:", final)

print("Test complete.")