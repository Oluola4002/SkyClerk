/*
  SKYCLERK - ESP32 FIRMWARE (STARTER)
  ------------------------------------
  This sketch connects your ESP32 to the SkyClerk server over MQTT and:
    1. Publishes telemetry (battery, GPS, altitude, speed, heading) every second
       to topic: skyclerk/telemetry
    2. Publishes payload presence (from the ultrasonic sensor) to:
       skyclerk/payload
    3. Listens for commands (ARM, TAKEOFF, RTL) on:
       skyclerk/command

  IMPORTANT:
  This is a STARTER template. Replace the placeholder sensor-reading
  functions (readBattery, readGPS, readUltrasonicDistance, etc.) with your
  actual sensor code / flight controller integration (e.g. MAVLink to your
  flight controller, or direct sensor wiring).

  WIRING NOTES:
  - Ultrasonic sensor (payload bay): TRIG -> GPIO 5, ECHO -> GPIO 18
  - Mini maglock: controlled via relay/MOSFET on GPIO 19
  - GPS module (e.g. NEO-6M): RX -> GPIO 16, TX -> GPIO 17 (Serial2)

  LIBRARIES NEEDED (Arduino IDE > Library Manager):
  - PubSubClient by Nick O'Leary
  - ArduinoJson by Benoit Blanchon
  - TinyGPSPlus by Mikal Hart (if using a real GPS module)
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---------- CONFIG: EDIT THESE ----------
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// IP address of the PC running the SkyClerk server (same WiFi network)
const char* MQTT_SERVER = "192.168.1.50";
const int MQTT_PORT = 1883;

// ---------- TOPICS ----------
const char* TOPIC_TELEMETRY = "skyclerk/telemetry";
const char* TOPIC_PAYLOAD = "skyclerk/payload";
const char* TOPIC_COMMAND = "skyclerk/command";

// ---------- PINS ----------
#define TRIG_PIN 5
#define ECHO_PIN 18
#define MAGLOCK_PIN 19

WiFiClient espClient;
PubSubClient mqtt(espClient);

unsigned long lastTelemetrySend = 0;
unsigned long lastPayloadCheck = 0;
bool lastPayloadState = false;

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(MAGLOCK_PIN, OUTPUT);
  digitalWrite(MAGLOCK_PIN, LOW); // locked

  connectWiFi();
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(onCommandReceived);
}

void loop() {
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  unsigned long now = millis();

  // Send telemetry every 1 second
  if (now - lastTelemetrySend > 1000) {
    lastTelemetrySend = now;
    sendTelemetry();
  }

  // Check payload presence every 500ms
  if (now - lastPayloadCheck > 500) {
    lastPayloadCheck = now;
    checkPayload();
  }
}

// ---------- WIFI ----------
void connectWiFi() {
  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
}

// ---------- MQTT ----------
void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.println("Connecting to MQTT broker...");
    String clientId = "esp32-skyclerk-" + String(random(0xffff), HEX);
    if (mqtt.connect(clientId.c_str())) {
      Serial.println("MQTT connected.");
      mqtt.subscribe(TOPIC_COMMAND);
    } else {
      Serial.printf("MQTT connect failed, rc=%d. Retrying in 2s...\n", mqtt.state());
      delay(2000);
    }
  }
}

void onCommandReceived(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<200> doc;
  deserializeJson(doc, payload, length);
  const char* command = doc["command"];

  Serial.printf("Command received: %s\n", command);

  if (strcmp(command, "ARM") == 0) {
    // TODO: arm your flight controller (e.g. send MAVLink ARM command)
  } else if (strcmp(command, "TAKEOFF") == 0) {
    // TODO: trigger takeoff sequence
  } else if (strcmp(command, "RTL") == 0) {
    // TODO: trigger return-to-launch
  }
}

// ---------- TELEMETRY ----------
void sendTelemetry() {
  StaticJsonDocument<256> doc;

  doc["battery"] = readBattery();
  doc["latitude"] = readLatitude();
  doc["longitude"] = readLongitude();
  doc["altitude"] = readAltitude();
  doc["speed"] = readGroundSpeed();
  doc["heading"] = readHeading();
  doc["signal"] = WiFi.RSSI() > -50 ? 100 : map(WiFi.RSSI(), -100, -50, 0, 100);

  char buffer[256];
  size_t n = serializeJson(doc, buffer);
  mqtt.publish(TOPIC_TELEMETRY, buffer, n);
}

// ---------- PAYLOAD DETECTION (ultrasonic) ----------
void checkPayload() {
  float distanceCm = readUltrasonicDistance();
  bool present = distanceCm > 0 && distanceCm < 5.0; // package sitting within 5cm of sensor

  if (present != lastPayloadState) {
    lastPayloadState = present;
    StaticJsonDocument<64> doc;
    doc["present"] = present;
    char buffer[64];
    size_t n = serializeJson(doc, buffer);
    mqtt.publish(TOPIC_PAYLOAD, buffer, n);
    Serial.printf("Payload state changed: %s\n", present ? "PRESENT" : "REMOVED");
  }
}

float readUltrasonicDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
  if (duration == 0) return -1;
  return duration * 0.0343 / 2; // cm
}

// ---------- PLACEHOLDER SENSOR READERS ----------
// Replace these with real readings from your flight controller / GPS / battery monitor.
float readBattery() { return 95.0; }
double readLatitude() { return 6.5244; }
double readLongitude() { return 3.3792; }
float readAltitude() { return 0.0; }
float readGroundSpeed() { return 0.0; }
float readHeading() { return 0.0; }
