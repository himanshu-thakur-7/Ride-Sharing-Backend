# 🚗 Ride Sharing Backend (Real-Time Matching System)

A **distributed ride-sharing backend prototype** that simulates how platforms like Uber match riders with nearby drivers in real time.

Built as a **systems design + backend engineering project**, this focuses on:

* low-latency matching
* real-time location updates
* event-driven workflows
* scalable architecture patterns (even in a local setup)

---

## 🧠 Why this project exists


It focuses on the **hard backend problems**:

* How do you match drivers in real-time?
* How do you handle location updates efficiently?
* How do you prevent double assignment?
* How do you simulate distributed systems locally?

---

## ⚙️ Tech Stack

| Layer     | Technology                |
| --------- | ------------------------- |
| Backend   | Python (FastAPI / Async)  |
| Cache     | Redis (Geo + Pub/Sub)     |
| Database  | DynamoDB (via LocalStack) |
| Infra     | Docker                    |
| Maps      | Leaflet + OpenStreetMap   |
| Messaging | Redis-based event flow    |

---

## 🏗️ System Architecture

### Core Components

* **Rider Service**

  * Creates ride requests
  * Tracks ride status

* **Driver Service**

  * Registers drivers
  * Continuously updates location

* **Matching Logic**

  * Finds nearest drivers using Redis Geo queries
  * Sends ride offers
  * Handles accept/reject flow

* **Redis**

  * Stores real-time driver locations
  * Acts as fast lookup + event layer

* **DynamoDB (LocalStack)**

  * Stores rides, drivers, and state transitions

---

## 🔄 How it works (Flow)

<img width="1672" height="941" alt="diagram" src="https://github.com/user-attachments/assets/30284c61-a7e8-40a3-bd94-e1c842afc367" />



1. Rider requests a ride
2. System queries Redis for nearby drivers
3. Closest driver is selected
5. Driver receives offer
6. Driver accepts/rejects
7. Ride state updates in DynamoDB
8. UI reflects real-time changes


---

## 🖥️ Demo UI


<img width="1284" height="858" alt="image" src="https://github.com/user-attachments/assets/5b537c3c-f5cf-4eaf-bc66-3daba1c05557" />


---

## ✨ Features

* Real-time driver location tracking
* Nearest driver matching using Redis GEO
* Offer → Accept / Reject flow
* Ride lifecycle tracking
* Event-driven state updates
* Fully local simulation (no cloud dependency)

---

## 🚀 Getting Started

### Prerequisites

* Docker
* Python 3.9+

---

### 1. Clone Repo

```bash
git clone https://github.com/himanshu-thakur-7/Ride-Sharing-Backend
cd Ride-Sharing-Backend
```

---

### 2. Start Infrastructure

```bash
docker-compose up -d
```

This will start:

* Redis
* LocalStack (DynamoDB)

---

### 3. Run Backend

```bash
pip install -r requirements.txt
python main.py
```

---

### 4. Open UI

Visit:

```
http://localhost:3000
```

---

## 🧪 How to Test the Flow

1. Register a driver
2. Set driver location
3. Create a ride request
4. Watch driver receive offer
5. Accept / Reject
6. Observe ride state transitions

---

## 📊 Data Design

### Redis (Hot Data)

* Driver locations (Geo index)
* Fast lookup for matching

### DynamoDB (Persistent State)

* Drivers
* Rides
* Ride Status

---

## ⚡ Key Design Decisions

### 1. Redis for Matching

Using Redis GEO instead of DB queries:

* O(log N) lookup
* optimized for proximity search
* low latency (<10ms)

---

### 2. Event-driven mindset (even locally)

Instead of tightly coupled calls:

* ride → offer → response flow modeled as events
* easier to scale later (Kafka, SQS, etc.)

---

### 3. LocalStack for AWS Simulation

* avoids real AWS costs
* replicates DynamoDB behavior
* keeps system cloud-ready

---

### 4. Separation of Concerns

* Driver logic isolated
* Rider logic isolated
* Matching logic centralized

---

## 📈 What this simulates (Real Systems)

This prototype mirrors real-world patterns:

| Real System      | This Project        |
| ---------------- | ------------------- |
| Kafka / PubSub   | Redis events        |
| DynamoDB         | LocalStack DynamoDB |
| Location Service | Redis GEO           |
| Matching Service | Python logic        |
| Mobile Apps      | Simple UI           |

---


## 🔮 Future Improvements

* Replace Redis events with Kafka
* Add WebSocket streaming
* Introduce driver batching strategy
* Add surge pricing logic
* Add retry + timeout handling
* Deploy on Kubernetes

---

## 👨‍💻 Author

**Himanshu Thakur**

* GitHub: [https://github.com/himanshu-thakur-7](https://github.com/himanshu-thakur-7)
* LinkedIn: [https://www.linkedin.com/in/himanshu-thakur-9582631a6/](https://www.linkedin.com/in/himanshu-thakur-9582631a6/)

---
