/*
  SKYCLERK - ESP32 <-> PIXHAWK MAVLINK TELEMETRY BRIDGE
  ------------------------------------------------------
  WHAT THIS DOES:
    - Reads live telemetry from a Pixhawk (ArduPilot) over MAVLink on a serial port
    - Reads the ultrasonic payload sensor directly on the ESP32
    - Publishes both to the SkyClerk server over MQTT/WiFi:
        skyclerk/telemetry  <- GPS, altitude, speed, heading, battery
        skyclerk/payload    <- package present / removed
    - This version READS telemetry only. It does NOT send ARM/TAKEOFF/RTL
      commands to the Pixhawk. For a first flight test you fly under RC control /
      a pre-loaded AUTO mission with RC override, and this just reports what the
      drone is doing. (Command sending can be added later once telemetry is proven.)

  ============================================================
  LIBRARY SETUP (do this first — MAVLink is not in Library Manager):
  ============================================================
  1. Download the ArduPilot MAVLink C library (v2) headers:
       https://github.com/mavlink/c_library_v2
     (Green "Code" button > Download ZIP, or git clone.)
  2. Put the whole folder inside your Arduino libraries folder, renamed to
     "mavlink":  Documents/Arduino/libraries/mavlink/
     So you end up with:  Documents/Arduino/libraries/mavlink/ardupilotmega/mavlink.h
  3. Restart Arduino IDE.
  4. Also install (Library Manager): PubSubClient by Nick O'Leary.
     (ArduinoJson is optional here — we build the JSON string manually to keep it light.)

  ============================================================
  WIRING (Pixhawk TELEM2 <-> ESP32):  *** ADJUST IF YOURS DIFFERS ***
  ============================================================
    Pixhawk TELEM2 TX  ->  ESP32 GPIO 16 (RX2)
    Pixhawk TELEM2 RX  ->  ESP32 GPIO 17 (TX2)
    Pixhawk TELEM2 GND ->  ESP32 GND        (common ground REQUIRED)
    Both are 3.3V logic, so no level shifter needed.
    TELEM1 and TELEM2 default to 57600 baud in ArduPilot.

    Ultrasonic sensor:
    TRIG -> GPIO 4 , ECHO -> GPIO 5 , VCC -> 5V , GND -> GND

  ============================================================
  IN MISSION PLANNER, confirm TELEM2 is set to MAVLink:
    SERIAL2_PROTOCOL = 2 (MAVLink2) , SERIAL2_BAUD = 57 (57600)
  ============================================================
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <MAVLink.h> // from what installed

// ==================== EDIT THESE LOCALLY — DO NOT COMMIT REAL VALUES ====================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// IP of the PC running the SkyClerk server (same WiFi/MiFi network)
const char* MQTT_SERVER = "192.168.1.50";
const int   MQTT_PORT   = 1883;

// Serial port the Pixhawk is wired to. Serial2 = GPIO16(RX)/GPIO17(TX).
#define PIXHAWK_SERIAL   Serial2
#define PIXHAWK_RX_PIN   16
#define PIXHAWK_TX_PIN   17
#define PIXHAWK_BAUD     57600
// ===================================================

// ---- Topics ----
const char* TOPIC_TELEMETRY = "skyclerk/telemetry";
const char* TOPIC_PAYLOAD   = "skyclerk/payload";

// ---- Ultrasonic pins ----
#define TRIG_PIN 4
#define ECHO_PIN 5

WiFiClient espClient;
PubSubClient mqtt(espClient);

// Latest values decoded from MAVLink (updated as messages arrive)
struct Telemetry {
  float battery = 0;      // %
  double latitude = 0;    // deg
  double longitude = 0;   // deg
  float altitude = 0;     // m (relative)
  float speed = 0;        // m/s (ground speed)
  float heading = 0;      // deg
  int   signalPct = 100;
} tel;

unsigned long lastPublish = 0;
unsigned long lastPayloadCheck = 0;
bool lastPayloadState = false;
bool pendingPayloadState = false;
int payloadStableCount = 0;
const int PAYLOAD_STABLE_THRESHOLD = 4; // require 4 consecutive matching reads (~2s) before reporting a change

void setup() {
  Serial.begin(115200);                 // USB debug
  PIXHAWK_SERIAL.begin(PIXHAWK_BAUD, SERIAL_8N1, PIXHAWK_RX_PIN, PIXHAWK_TX_PIN);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  connectWiFi();
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
}

void loop() {
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  readMavlink();     // continuously drain the Pixhawk serial stream

  unsigned long now = millis();

  if (now - lastPublish > 1000) {        // publish telemetry once per second
    lastPublish = now;
    publishTelemetry();
  }

  if (now - lastPayloadCheck > 500) {    // check payload twice per second
    lastPayloadCheck = now;
    checkPayload();
  }
}

// ==================== WIFI / MQTT ====================
void connectWiFi() {
  Serial.printf("WiFi: connecting to %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
}

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.println("MQTT: connecting...");
    String id = "esp32-skyclerk-" + String(random(0xffff), HEX);
    if (mqtt.connect(id.c_str())) {
      Serial.println("MQTT connected.");
    } else {
      Serial.printf("MQTT failed rc=%d, retry in 2s\n", mqtt.state());
      delay(2000);
    }
  }
}

// ==================== MAVLINK READING ====================
// Parses incoming bytes from the Pixhawk one at a time. When a full message
// is decoded, we pull out the fields we care about.
void readMavlink() {
  mavlink_message_t msg;
  mavlink_status_t status;

  while (PIXHAWK_SERIAL.available() > 0) {
    uint8_t c = PIXHAWK_SERIAL.read();
    if (mavlink_parse_char(MAVLINK_COMM_0, c, &msg, &status)) {
      switch (msg.msgid) {

        case MAVLINK_MSG_ID_GLOBAL_POSITION_INT: {
          mavlink_global_position_int_t d;
          mavlink_msg_global_position_int_decode(&msg, &d);
          tel.latitude  = d.lat / 1e7;         // degE7 -> deg
          tel.longitude = d.lon / 1e7;
          tel.altitude  = d.relative_alt / 1000.0; // mm -> m
          tel.heading   = d.hdg / 100.0;       // cdeg -> deg
          break;
        }

        case MAVLINK_MSG_ID_VFR_HUD: {
          mavlink_vfr_hud_t d;
          mavlink_msg_vfr_hud_decode(&msg, &d);
          tel.speed = d.groundspeed;           // m/s
          break;
        }

        case MAVLINK_MSG_ID_SYS_STATUS: {
          mavlink_sys_status_t d;
          mavlink_msg_sys_status_decode(&msg, &d);
          tel.battery = d.battery_remaining;   // % (-1 if unknown)
          if (tel.battery < 0) tel.battery = 0;
          break;
        }
      }
    }
  }
}

// ==================== PUBLISH ====================
void publishTelemetry() {
  tel.signalPct = (WiFi.RSSI() > -50) ? 100 :
                  constrain(map(WiFi.RSSI(), -100, -50, 0, 100), 0, 100);

  char buf[256];
  snprintf(buf, sizeof(buf),
    "{\"battery\":%.0f,\"latitude\":%.6f,\"longitude\":%.6f,"
    "\"altitude\":%.1f,\"speed\":%.1f,\"heading\":%.0f,\"signal\":%d}",
    tel.battery, tel.latitude, tel.longitude,
    tel.altitude, tel.speed, tel.heading, tel.signalPct);

  mqtt.publish(TOPIC_TELEMETRY, buf);
}

// ==================== PAYLOAD (ultrasonic) ====================
void checkPayload() {
  float cm = readUltrasonicDistance();
  bool present = (cm > 0 && cm < 5.0);   // package within 5cm of sensor

  // Debounce: only trust a reading once it's stayed consistent for several
  // consecutive checks, so a single noisy ultrasonic blip can't flip the state.
  if (present == pendingPayloadState) {
    payloadStableCount++;
  } else {
    pendingPayloadState = present;
    payloadStableCount = 1;
  }

  if (payloadStableCount >= PAYLOAD_STABLE_THRESHOLD && pendingPayloadState != lastPayloadState) {
    lastPayloadState = pendingPayloadState;
    char buf[32];
    snprintf(buf, sizeof(buf), "{\"present\":%s}", lastPayloadState ? "true" : "false");
    mqtt.publish(TOPIC_PAYLOAD, buf);
    Serial.printf("Payload: %s\n", lastPayloadState ? "PRESENT" : "REMOVED");
  }
}

float readUltrasonicDistance() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
  if (dur == 0) return -1;
  return dur * 0.0343 / 2.0; // cm
}
