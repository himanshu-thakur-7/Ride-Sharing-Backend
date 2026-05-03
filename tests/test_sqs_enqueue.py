"""
Test: SQS enqueue on ride creation

Verifies:
- Ride is created
- Message is pushed to SQS
- Message contains correct payload
"""

import requests
import boto3
import json
import time

BASE_URL = "http://localhost:8000"

QUEUE_URL = "http://localhost:4566/000000000000/ride-matching-queue"


# ---------------- SQS Client ----------------

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
    # SQS purge is async, give it a moment
    time.sleep(2)


def receive_messages():
    response = sqs.receive_message(
        QueueUrl=QUEUE_URL,
        MaxNumberOfMessages=10,
        WaitTimeSeconds=2
    )
    return response.get("Messages", [])


def create_ride():
    res = requests.post(
        f"{BASE_URL}/rides",
        json={
            "pickup": {"lat": 12.9716, "lng": 77.5946},
            "destination": {"lat": 12.9352, "lng": 77.6245}
        }
    )
    return res.json()


# ---------------- Test ----------------

def test_enqueue_on_ride_creation():
    print("\n--- TEST: SQS ENQUEUE ON RIDE CREATION ---")

    print("\n[STEP] Purging queue")
    purge_queue()

    print("[STEP] Verifying queue is empty")
    msgs = receive_messages()
    assert len(msgs) == 0, "Queue should be empty before test"
    print("[PASS] Queue is empty")

    print("\n[STEP] Creating ride")
    ride = create_ride()
    ride_id = ride["id"]
    print("Ride created:", ride_id)

    time.sleep(1)

    print("\n[STEP] Receiving messages from queue")
    msgs = receive_messages()

    assert len(msgs) > 0, "No message received in queue"
    print(f"[PASS] Received {len(msgs)} message(s)")

    message_body = json.loads(msgs[0]["Body"])
    print("Message body:", message_body)

    print("\n[STEP] Validating message content")
    assert message_body["type"] == "MATCH_RIDE", "Incorrect message type"
    assert message_body["ride_id"] == ride_id, "Ride ID mismatch"

    print("[PASS] Message structure is correct")

    print("\nTest completed successfully")


# ---------------- Run ----------------

if __name__ == "__main__":
    test_enqueue_on_ride_creation()