"""
Test: SQS + Worker end-to-end flow

Validates:
- Ride enqueued to SQS
- Worker picks message
- Matching happens
- Ride moves to OFFER_SENT
"""

import requests
import boto3
import time

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

# ---------------- Helpers ----------------

def purge_queue():
    sqs.purge_queue(QueueUrl=QUEUE_URL)
    time.sleep(2)


def create_driver(name):
    return requests.post(
        f"{BASE_URL}/drivers",
        json={"name": name}
    ).json()


def set_location(driver_id):
    requests.patch(
        f"{BASE_URL}/drivers/{driver_id}/location",
        json={"lat": 12.9716, "lng": 77.5946}
    )


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


# ---------------- Test ----------------

def test_worker_processes_match():
    print("\n--- TEST: WORKER PROCESSES MATCH_RIDE ---")

    print("\n[STEP] Purging queue")
    purge_queue()

    print("[STEP] Creating driver")
    driver = create_driver("Driver A")
    set_location(driver["id"])

    print("[STEP] Creating ride")
    ride = create_ride()
    ride_id = ride["id"]

    print("Ride created:", ride_id)

    print("\n[STEP] Waiting for worker to process message")
    time.sleep(3)

    ride = get_ride(ride_id)
    print("Ride state after worker:", ride)

    assert ride["status"] == "OFFER_SENT", "Worker did not process MATCH_RIDE"
    assert ride["driver_id"] is not None, "Driver not assigned"

    print("\n[PASS] Worker successfully processed message")


# ---------------- Run ----------------

if __name__ == "__main__":
    test_worker_processes_match()