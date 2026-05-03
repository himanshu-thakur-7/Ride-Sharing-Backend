"""
Verbose End-to-End Test Suite

Purpose:
- Validate all flows
- Provide detailed terminal visibility
- Help debug state transitions step-by-step
"""

import requests
import time
import sys

BASE_URL = "http://localhost:8000"


# ---------------- Logging Helpers ----------------

def log_section(title):
    print("\n" + "=" * 80)
    print(f"{title}")
    print("=" * 80)


def log_step(step):
    print(f"\n[STEP] {step}")


def log_data(label, data):
    print(f"{label}:")
    print(data)


def log_assert(condition, message):
    if condition:
        print(f"[PASS] {message}")
    else:
        print(f"[FAIL] {message}")
        sys.exit(1)


def wait(seconds):
    print(f"\n[WAIT] Sleeping for {seconds} seconds...")
    time.sleep(seconds)


# ---------------- API Helpers ----------------

def create_driver(name):
    res = requests.post(
        f"{BASE_URL}/drivers",
        json={"name": name}
    ).json()

    log_data("Driver created", res)
    return res


def set_location(driver_id, lat=12.9716, lng=77.5946):
    res = requests.patch(
        f"{BASE_URL}/drivers/{driver_id}/location",
        json={"lat": lat, "lng": lng}
    ).json()

    log_data(f"Location set for {driver_id}", res)


def create_ride():
    res = requests.post(
        f"{BASE_URL}/rides",
        json={
            "pickup": {"lat": 12.9716, "lng": 77.5946},
            "destination": {"lat": 12.9352, "lng": 77.6245}
        }
    ).json()

    log_data("Ride created", res)
    return res


def get_ride(ride_id):
    res = requests.get(f"{BASE_URL}/rides/{ride_id}").json()
    log_data("Ride state", res)
    return res


def driver_respond(driver_id, ride_id, accept):
    res = requests.post(
        f"{BASE_URL}/drivers/{driver_id}/respond",
        params={"ride_id": ride_id, "accept": accept}
    ).json()

    log_data("Driver response", res)
    return res

def reset_system():
    requests.post(f"{BASE_URL}/test/reset")

# ---------------- Tests ----------------

def test_accept_flow():
    reset_system()
    log_section("TEST 1: ACCEPT FLOW")

    log_step("Create driver")
    d1 = create_driver("Driver A")

    log_step("Set driver location")
    set_location(d1["id"])

    log_step("Create ride")
    ride = create_ride()
    ride_id = ride["id"]

    wait(1)

    log_step("Fetch assigned ride")
    ride = get_ride(ride_id)

    log_assert(ride["status"] == "OFFER_SENT", "Ride should be OFFER_SENT")

    log_step("Driver accepts ride")
    driver_respond(ride["driver_id"], ride_id, True)

    wait(1)

    log_step("Verify final state")
    ride = get_ride(ride_id)

    log_assert(ride["status"] == "ACCEPTED", "Ride should be ACCEPTED")


def test_reject_flow():
    reset_system()
    log_section("TEST 2: REJECT AND REASSIGN")

    d1 = create_driver("Driver A")
    d2 = create_driver("Driver B")

    set_location(d1["id"])
    set_location(d2["id"])

    ride = create_ride()
    ride_id = ride["id"]

    wait(1)

    ride = get_ride(ride_id)
    first_driver = ride["driver_id"]

    log_step("Driver rejects ride")
    driver_respond(first_driver, ride_id, False)

    wait(1)

    ride = get_ride(ride_id)

    log_assert(ride["driver_id"] != first_driver, "Ride should be reassigned")
    log_assert(ride["status"] == "OFFER_SENT", "Ride should still be OFFER_SENT")


def test_timeout_flow():
    reset_system()
    log_section("TEST 3: TIMEOUT + RETRY")

    d1 = create_driver("Driver A")
    d2 = create_driver("Driver B")

    set_location(d1["id"])
    set_location(d2["id"])

    ride = create_ride()
    ride_id = ride["id"]

    wait(1)

    ride = get_ride(ride_id)
    first_driver = ride["driver_id"]

    log_step("Waiting for first timeout")
    wait(11)

    ride = get_ride(ride_id)

    log_assert(ride["driver_id"] != first_driver, "Driver should change after timeout")


def test_full_exhaustion():
    reset_system()
    log_section("TEST 4: FULL DRIVER EXHAUSTION")

    d1 = create_driver("Driver A")
    d2 = create_driver("Driver B")

    set_location(d1["id"])
    set_location(d2["id"])

    ride = create_ride()
    ride_id = ride["id"]

    log_step("Waiting for all drivers to timeout")
    wait(22)

    ride = get_ride(ride_id)

    log_assert(ride["status"] == "CANCELLED", "Ride should be CANCELLED")
    log_assert(len(ride["tried_drivers"]) == 2, "Both drivers should be attempted")


def test_invalid_transition():
    reset_system()
    log_section("TEST 5: INVALID STATE TRANSITION")

    ride = create_ride()
    ride_id = ride["id"]

    wait(1)

    log_step("Attempt invalid transition to COMPLETED")
    res = requests.patch(
        f"{BASE_URL}/rides/{ride_id}",
        params={"status": "COMPLETED"}
    ).json()

    log_data("Invalid transition response", res)

    log_assert("error" in res, "Invalid transition should be rejected")


# ---------------- Runner ----------------

if __name__ == "__main__":
    start = time.time()

    test_accept_flow()
    test_reject_flow()
    test_timeout_flow()
    test_full_exhaustion()
    test_invalid_transition()

    end = time.time()

    print("\n" + "=" * 80)
    print(f"ALL TESTS PASSED | Total Time: {round(end - start, 2)}s")
    print("=" * 80)