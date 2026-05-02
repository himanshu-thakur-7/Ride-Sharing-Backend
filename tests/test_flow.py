import requests
import time

BASE_URL = "http://localhost:8000"

def create_driver(name):
    res = requests.post(f"{BASE_URL}/drivers", json={"name": name})
    return res.json()

def update_location(driver_id, lat, long):
    requests.patch(
        f"{BASE_URL}/drivers/{driver_id}/location",
        json={"lat": lat, "long": long}
    )

def create_ride():
    res = requests.post(f"{BASE_URL}/rides", json={
        "pickup": {"lat": 12.9716, "long": 77.5946},
        "destination": {"lat": 12.9352, "long": 77.6245}
    })
    return res.json()

def driver_response(driver_id, ride_id, accept):
    res = requests.post(
        f"{BASE_URL}/drivers/{driver_id}/respond",
        params={"ride_id": ride_id, "accept": accept}
    )
    return res.json()

# ---- TEST FLOW ----

print("\nCreating drivers...")
d1 = create_driver("Driver A")
d2 = create_driver("Driver B")
d3 = create_driver("Driver C")

print("Drivers:", d1["id"], d2["id"], d3["id"])

print("\nUpdating locations...")
update_location(d1["id"], 12.9725, 77.5930)  # closest
update_location(d2["id"], 12.9611, 77.6387)
update_location(d3["id"], 12.9352, 77.6245)

time.sleep(1)

print("\nCreating ride...")
ride = create_ride()
ride_id = ride["Id"] if "Id" in ride else ride["id"]

print("Ride created:", ride)

current_driver = ride.get("driver_id")

# simulate rejection loop
while current_driver:
    print(f"\nDriver {current_driver} rejecting ride...")
    res = driver_response(current_driver, ride_id, False)
    print(res)

    ride = res.get("ride", ride)

    if ride["status"] == "CANCELLED":
        print("\nNo drivers left. Ride cancelled.")
        break

    current_driver = ride.get("driver_id")

# final accept if any driver left
if current_driver:
    print(f"\nDriver {current_driver} ACCEPTING ride...")
    res = driver_response(current_driver, ride_id, True)
    print(res)

print("\nTest complete.")