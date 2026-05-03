"""
Full System Integration Test

Covers:
- Queue enqueue
- Worker processing
- Driver assignment
- Timeout retry
- Final cancellation
- Accept flow
"""

import requests
import time
import boto3
import json
import sys

BASE_URL = "http://localhost:8000"
QUEUE_URL = "http://localhost:4566/000000000000/ride-matching-queue"

# ---------------- SQS ----------------

sqs = boto3.client(
    "sqs",
    region_name="us-east-1",
    endpoint_url="http://localhost:4566",
    aws_access_key_id="test",
    aws_secret_access_key="test"
)

# ---------------- Logging ----------------

def section(title):
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)

def step(msg):
    print(f"\n[STEP] {msg}")

def log(label, data):
    print(f"{label}: {data}")

def fail(msg):
    print(f"[FAIL] {msg}")
    sys.exit(1)

def ok(msg):
    print(f"[PASS] {msg}")

# ---------------- Helpers ----------------

def reset():
    requests.post(f"{BASE_URL}/test/reset")
    sqs.purge_queue(QueueUrl=QUEUE_URL)
    time.sleep(2)

def create_driver(name):
    res = requests.post(f"{BASE_URL}/drivers", json={"name": name}).json()
    log("Driver created", res)
    return res

def set_location(driver_id):
    res = requests.patch(
        f"{BASE_URL}/drivers/{driver_id}/location",
        json={"lat": 12.9716, "lng": 77.5946}
    ).json()
    log("Location set", res)

def create_ride():
    res = requests.post(
        f"{BASE_URL}/rides",
        json={
            "pickup": {"lat": 12.9716, "lng": 77.5946},
            "destination": {"lat": 12.9352, "lng": 77.6245}
        }
    ).json()
    log("Ride created", res)
    return res

def get_ride(ride_id):
    res = requests.get(f"{BASE_URL}/rides/{ride_id}").json()
    log("Ride state", res)
    return res

def driver_respond(driver_id, ride_id, accept):
    res = requests.post(
        f"{BASE_URL}/drivers/{driver_id}/respond",
        params={"ride_id": ride_id, "accept": accept}
    ).json()
    log("Driver response", res)
    return res

def wait(sec):
    print(f"\n[WAIT] {sec} seconds...")
    time.sleep(sec)

# ---------------- Tests ----------------

def test_full_exhaustion():
    section("TEST 1: FULL EXHAUSTION FLOW")

    reset()

    d1 = create_driver("Driver A")
    d2 = create_driver("Driver B")

    set_location(d1["id"])
    set_location(d2["id"])

    ride = create_ride()
    ride_id = ride["id"]

    wait(2)

    ride = get_ride(ride_id)

    if ride["status"] != "OFFER_SENT":
        fail("Expected OFFER_SENT after initial match")

    wait(22)

    ride = get_ride(ride_id)

    if ride["status"] != "CANCELLED":
        fail("Expected CANCELLED after all drivers exhausted")

    if len(ride["tried_drivers"]) != 2:
        fail("Expected both drivers to be tried")

    ok("Full exhaustion flow works")


def test_accept_flow():
    section("TEST 2: ACCEPT FLOW")

    reset()

    d1 = create_driver("Driver A")
    set_location(d1["id"])

    ride = create_ride()
    ride_id = ride["id"]

    wait(2)

    ride = get_ride(ride_id)

    if ride["status"] != "OFFER_SENT":
        fail("Expected OFFER_SENT before accept")

    driver_id = ride["driver_id"]

    step("Driver accepts ride")
    driver_respond(driver_id, ride_id, True)

    wait(1)

    ride = get_ride(ride_id)

    if ride["status"] != "ACCEPTED":
        fail("Expected ACCEPTED after driver accepts")

    ok("Accept flow works")


def test_reject_then_retry():
    section("TEST 3: REJECT THEN RETRY")

    reset()

    d1 = create_driver("Driver A")
    d2 = create_driver("Driver B")

    set_location(d1["id"])
    set_location(d2["id"])

    ride = create_ride()
    ride_id = ride["id"]

    wait(2)

    ride = get_ride(ride_id)
    first_driver = ride["driver_id"]

    step("Driver rejects ride")
    driver_respond(first_driver, ride_id, False)

    wait(2)

    ride = get_ride(ride_id)

    if ride["driver_id"] == first_driver:
        fail("Expected reassignment after rejection")

    if ride["status"] != "OFFER_SENT":
        fail("Expected OFFER_SENT after retry")

    ok("Reject + retry flow works")


def test_queue_enqueue():
    section("TEST 4: QUEUE ENQUEUE")

    reset()

    ride = create_ride()

    wait(1)

    msgs = sqs.receive_message(
        QueueUrl=QUEUE_URL,
        MaxNumberOfMessages=1,
        WaitTimeSeconds=2
    ).get("Messages", [])

    if not msgs:
        fail("No message found in queue")

    body = json.loads(msgs[0]["Body"])
    log("Message body", body)

    if body["type"] != "MATCH_RIDE":
        fail("Expected MATCH_RIDE message")

    ok("Queue enqueue works")


# ---------------- Runner ----------------

if __name__ == "__main__":
    start = time.time()

    # test_queue_enqueue()
    test_accept_flow()
    test_reject_then_retry()
    test_full_exhaustion()

    end = time.time()

    print("\n" + "=" * 80)
    print(f"ALL TESTS PASSED | Total Time: {round(end - start, 2)} seconds")
    print("=" * 80)