import boto3
import json

from main import assign_next_driver, get_ride_db, QUEUE_URL,handle_driver_timeout

sqs = boto3.client(
    "sqs",
    region_name="us-east-1",
    endpoint_url="http://localhost:4566",
    aws_access_key_id="test",
    aws_secret_access_key="test"
)

def process_message(message):
    body = json.loads(message["Body"])

    msg_type = body.get("type")
    ride_id = body.get("ride_id")

    print(f"\nProcessing Message: {body}")

    if not msg_type or not ride_id:
        print("Invalid message format")
        return

    if msg_type == "MATCH_RIDE":
        ride = get_ride_db(ride_id)

        if not ride:
            print("Ride not found")
            return
        
        assign_next_driver(ride)
    elif msg_type == "CHECK_TIMEOUT":
        driver_id = body.get("driver_id")
        lock_value = body.get("lock_value")

        if not driver_id or not lock_value:
            print("Invalid timeout message")
            return
        
        handle_driver_timeout(ride_id,driver_id,lock_value)


def poll():
    print("Worker Started")

    while True:
        response = sqs.receive_message(
            QueueUrl=QUEUE_URL,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=10
        )

        messages = response.get("Messages", [])

        if not messages:
            continue

        for message in messages:
            try:
                process_message(message)

                sqs.delete_message(
                    QueueUrl=QUEUE_URL,
                    ReceiptHandle=message["ReceiptHandle"]
                )

                print("Message processed and deleted")
            
            except Exception as e:
                print("Error processing message:", e)


if __name__ == "__main__":
    poll()