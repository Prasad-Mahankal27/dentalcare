from datetime import datetime, timezone
import os
import re
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, request
import requests
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOTENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(DOTENV_PATH)

app = Flask(__name__)

ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN")
WHATSAPP_HOST = os.getenv("WHATSAPP_HOST", "0.0.0.0")

try:
    WHATSAPP_PORT = int(os.getenv("WHATSAPP_PORT", "5000"))
except ValueError:
    WHATSAPP_PORT = 5000

WHATSAPP_DEBUG = str(os.getenv("WHATSAPP_DEBUG", "0")).strip().lower() in {"1", "true", "yes", "on"}

BOOKING_API_URL = os.getenv(
    "BOOKING_API_URL",
    "http://localhost:4000/appointments/whatsapp/request"
)
BOOKING_SLOTS_API_URL = os.getenv(
    "BOOKING_SLOTS_API_URL",
    "http://localhost:4000/appointments/whatsapp/available-slots"
)
BOOKING_UPCOMING_API_URL = os.getenv(
    "BOOKING_UPCOMING_API_URL",
    "http://localhost:4000/appointments/whatsapp/upcoming"
)
BOOKING_RESCHEDULE_API_URL = os.getenv(
    "BOOKING_RESCHEDULE_API_URL",
    "http://localhost:4000/appointments/whatsapp/reschedule"
)
BOOKING_SHARED_SECRET = os.getenv("WHATSAPP_BOOKING_SECRET")
BOOKING_TIMEZONE_NAME = os.getenv("BOOKING_TIMEZONE", "Asia/Kolkata")

try:
    BOOKING_TIMEZONE = ZoneInfo(BOOKING_TIMEZONE_NAME)
except Exception:
    BOOKING_TIMEZONE = ZoneInfo("Asia/Kolkata")

CONVERSATIONS = {}
DATE_PROMPT_EXAMPLE = "10 April"
SLOT_LIST_LIMIT = 8
EXIT_KEYWORDS = {"cancel", "stop", "exit"}
YES_KEYWORDS = {"yes", "y", "haan", "book", "book appointment"}
NO_KEYWORDS = {"no", "n", "not now"}
RESCHEDULE_KEYWORDS = {"reschedule", "change", "another", "another date"}
SKIP_KEYWORDS = {"skip", "na", "none", "no"}
RESCHEDULE_INTENT_KEYWORDS = {
    "reschedule",
    "reschedule appointment",
    "change appointment",
    "change my appointment",
    "move appointment",
    "postpone appointment"
}


def build_graph_url():
    return f"https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages"


def send_whatsapp_payload(payload):
    if not ACCESS_TOKEN or not PHONE_NUMBER_ID:
        return {"message": "WhatsApp credentials missing"}, 500

    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(build_graph_url(), headers=headers, json=payload, timeout=10)
    except requests.RequestException as exc:
        return {"message": "WhatsApp request failed", "error": str(exc)}, 502

    try:
        body = response.json()
    except ValueError:
        body = {"message": "WhatsApp API returned non-JSON response", "status": response.status_code}

    return body, response.status_code


def send_text_message(recipient, text):
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "text",
        "text": {
            "body": text
        }
    }
    body, status_code = send_whatsapp_payload(payload)
    if status_code >= 400:
        app.logger.error("Text send failed (status=%s): %s", status_code, body)
    return body, status_code


def normalize_phone(raw_phone):
    if not raw_phone:
        return ""
    return "".join(ch for ch in str(raw_phone) if ch.isdigit())


def parse_booking_date(raw_text):
    cleaned = (raw_text or "").strip()
    if not cleaned:
        return None

    cleaned = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned.replace(",", " ")).strip()

    today = datetime.now().date()

    for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %B %Y", "%d %b %Y"]:
        try:
            parsed = datetime.strptime(cleaned, fmt).date()
            return parsed if parsed >= today else None
        except ValueError:
            continue

    for fmt in ["%d %B", "%d %b", "%d-%m", "%d/%m"]:
        try:
            parsed_partial = datetime.strptime(cleaned, fmt)
            candidate = parsed_partial.date().replace(year=today.year)
            if candidate < today:
                candidate = candidate.replace(year=today.year + 1)
            return candidate
        except ValueError:
            continue

    return None


def parse_time_selection(raw_text):
    cleaned = (raw_text or "").strip().upper()
    if not cleaned:
        return None

    cleaned = cleaned.replace(".", "")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if re.match(r"^\d{1,2}(AM|PM)$", cleaned):
        cleaned = f"{cleaned[:-2]} {cleaned[-2:]}"

    for fmt in ["%I %p", "%I:%M %p", "%H:%M"]:
        try:
            parsed = datetime.strptime(cleaned, fmt)
            return parsed.hour, parsed.minute
        except ValueError:
            continue

    return None


def parse_age_input(raw_text):
    try:
        age = int(str(raw_text or "").strip())
    except (TypeError, ValueError):
        return None

    if age < 1 or age > 120:
        return None

    return age


def parse_gender_input(raw_text):
    normalized = str(raw_text or "").strip().lower()

    if normalized in {"male", "m"}:
        return "Male"
    if normalized in {"female", "f"}:
        return "Female"
    if normalized in {"other", "o"}:
        return "Other"

    return None


def create_appointment_request(
    patient_name,
    patient_phone,
    age,
    gender,
    address,
    preferred_datetime,
    reason,
    whatsapp_message_id,
    status="REQUESTED"
):
    headers = {"Content-Type": "application/json"}
    if BOOKING_SHARED_SECRET:
        headers["x-whatsapp-booking-secret"] = BOOKING_SHARED_SECRET

    payload = {
        "phone": patient_phone,
        "name": patient_name,
        "age": age,
        "gender": gender,
        "address": address,
        "preferredDateTime": preferred_datetime,
        "reason": reason,
        "whatsappMessageId": whatsapp_message_id,
        "status": status
    }

    try:
        response = requests.post(BOOKING_API_URL, json=payload, headers=headers, timeout=10)
    except requests.RequestException as exc:
        return False, {"message": f"Booking API unreachable: {exc}"}

    try:
        body = response.json()
    except ValueError:
        body = {"message": "Booking API returned non-JSON response"}

    return response.ok, body


def fetch_available_slots(
    booking_date=None,
    limit=SLOT_LIST_LIMIT,
    doctor_id=None,
    exclude_appointment_id=None
):
    headers = {"Content-Type": "application/json"}
    if BOOKING_SHARED_SECRET:
        headers["x-whatsapp-booking-secret"] = BOOKING_SHARED_SECRET

    params = {"limit": limit}
    if booking_date:
        params["date"] = booking_date
        params["days"] = 1
    if doctor_id:
        params["doctorId"] = doctor_id
    if exclude_appointment_id:
        params["excludeAppointmentId"] = exclude_appointment_id

    try:
        response = requests.get(BOOKING_SLOTS_API_URL, params=params, headers=headers, timeout=10)
    except requests.RequestException as exc:
        return False, {"message": f"Slots API unreachable: {exc}"}

    try:
        body = response.json()
    except ValueError:
        body = {"message": "Slots API returned non-JSON response"}

    return response.ok, body


def fetch_upcoming_appointments(phone, limit=5):
    headers = {"Content-Type": "application/json"}
    if BOOKING_SHARED_SECRET:
        headers["x-whatsapp-booking-secret"] = BOOKING_SHARED_SECRET

    params = {
        "phone": phone,
        "limit": limit
    }

    try:
        response = requests.get(BOOKING_UPCOMING_API_URL, params=params, headers=headers, timeout=10)
    except requests.RequestException as exc:
        return False, {"message": f"Upcoming appointments API unreachable: {exc}"}

    try:
        body = response.json()
    except ValueError:
        body = {"message": "Upcoming appointments API returned non-JSON response"}

    return response.ok, body


def create_reschedule_request(phone, appointment_id, preferred_datetime, whatsapp_message_id):
    headers = {"Content-Type": "application/json"}
    if BOOKING_SHARED_SECRET:
        headers["x-whatsapp-booking-secret"] = BOOKING_SHARED_SECRET

    payload = {
        "phone": phone,
        "appointmentId": appointment_id,
        "preferredDateTime": preferred_datetime,
        "whatsappMessageId": whatsapp_message_id
    }

    try:
        response = requests.post(BOOKING_RESCHEDULE_API_URL, json=payload, headers=headers, timeout=10)
    except requests.RequestException as exc:
        return False, {"message": f"Reschedule API unreachable: {exc}"}

    try:
        body = response.json()
    except ValueError:
        body = {"message": "Reschedule API returned non-JSON response"}

    return response.ok, body


def to_slot_labels(slot_iso):
    try:
        parsed = datetime.fromisoformat(slot_iso.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        parsed = parsed.astimezone(BOOKING_TIMEZONE)
    except ValueError:
        return {
            "time_label": slot_iso,
            "date_label": "",
            "full_label": slot_iso
        }

    return {
        "time_label": parsed.strftime("%I:%M %p").lstrip("0"),
        "date_label": parsed.strftime("%d %b %Y"),
        "full_label": parsed.strftime("%d %b %Y, %I:%M %p").lstrip("0")
    }


def enrich_slot_choices(slots):
    enriched = []
    for index, slot in enumerate(slots, start=1):
        slot_iso = slot.get("iso")
        if not slot_iso:
            continue

        labels = to_slot_labels(slot_iso)
        enriched.append({
            "reply_id": f"slot_{index}",
            "iso": slot_iso,
            "time_label": labels["time_label"],
            "date_label": labels["date_label"],
            "display": slot.get("display") or labels["full_label"]
        })
    return enriched


def send_button_message(recipient, body_text, buttons):
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {
                "text": body_text
            },
            "action": {
                "buttons": [
                    {
                        "type": "reply",
                        "reply": {
                            "id": button_id,
                            "title": title[:20]
                        }
                    }
                    for button_id, title in buttons[:3]
                ]
            }
        }
    }
    body, status_code = send_whatsapp_payload(payload)
    if status_code >= 400:
        app.logger.error("Interactive button send failed (status=%s): %s", status_code, body)
    return body, status_code


def send_book_prompt(phone):
    _, status_code = send_button_message(
        phone,
        "Book appointment?",
        [("book_yes", "Yes"), ("book_no", "No")]
    )
    if status_code >= 400:
        send_text_message(phone, "Book appointment? Reply with Yes or No.")


def send_confirmation_prompt(phone, summary_text):
    _, status_code = send_button_message(
        phone,
        summary_text,
        [("confirm_yes", "Yes"), ("confirm_reschedule", "Reschedule")]
    )
    if status_code >= 400:
        send_text_message(
            phone,
            f"{summary_text}\nReply Yes to confirm or Reschedule to change date."
        )


def send_slot_list_message(phone, requested_date_label, slots):
    rows = []
    for slot in slots[:10]:
        rows.append({
            "id": slot["reply_id"],
            "title": slot["time_label"][:24],
            "description": slot["date_label"][:72]
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {
                "text": f"Available slots for {requested_date_label}."
            },
            "footer": {
                "text": "Pick a slot to continue"
            },
            "action": {
                "button": "View slots",
                "sections": [
                    {
                        "title": "Available slots",
                        "rows": rows
                    }
                ]
            }
        }
    }

    body, status_code = send_whatsapp_payload(payload)
    if status_code >= 400:
        fallback_lines = [f"{index}. {slot['display']}" for index, slot in enumerate(slots, start=1)]
        send_text_message(
            phone,
            "Available slots:\n"
            + "\n".join(fallback_lines)
            + "\n\nReply with the slot number."
        )
    return body, status_code


def extract_messages(payload):
    messages = []

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            contacts = value.get("contacts", [])
            contact_map = {}

            for contact in contacts:
                wa_id = normalize_phone(contact.get("wa_id"))
                contact_map[wa_id] = contact.get("profile", {}).get("name")

            for incoming in value.get("messages", []):
                phone = normalize_phone(incoming.get("from"))
                message_type = incoming.get("type")
                text_body = ""
                reply_id = None

                if message_type == "text":
                    text_body = (incoming.get("text", {}).get("body") or "").strip()
                elif message_type == "button":
                    button_payload = incoming.get("button", {})
                    text_body = (button_payload.get("text") or button_payload.get("payload") or "").strip()
                    reply_id = (button_payload.get("payload") or "").strip() or None
                elif message_type == "interactive":
                    interactive_payload = incoming.get("interactive", {})
                    interactive_type = interactive_payload.get("type")
                    if interactive_type == "button_reply":
                        button_reply = interactive_payload.get("button_reply", {})
                        text_body = (button_reply.get("title") or button_reply.get("id") or "").strip()
                        reply_id = (button_reply.get("id") or "").strip() or None
                    elif interactive_type == "list_reply":
                        list_reply = interactive_payload.get("list_reply", {})
                        text_body = (list_reply.get("title") or list_reply.get("id") or "").strip()
                        reply_id = (list_reply.get("id") or "").strip() or None

                if not phone or not text_body:
                    continue

                messages.append({
                    "phone": phone,
                    "text": text_body,
                    "name": contact_map.get(phone),
                    "message_id": incoming.get("id"),
                    "reply_id": reply_id
                })

    return messages


def extract_status_updates(payload):
    status_updates = []

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for status_item in value.get("statuses", []):
                errors = []
                for error_item in status_item.get("errors", []):
                    error_data = error_item.get("error_data") or {}
                    errors.append({
                        "code": error_item.get("code"),
                        "title": error_item.get("title"),
                        "message": error_item.get("message"),
                        "details": error_data.get("details")
                    })

                status_updates.append({
                    "id": status_item.get("id"),
                    "status": status_item.get("status"),
                    "recipient_id": status_item.get("recipient_id"),
                    "timestamp": status_item.get("timestamp"),
                    "errors": errors
                })

    return status_updates


def find_selected_slot(slots, text, reply_id):
    if reply_id:
        for slot in slots:
            if slot.get("reply_id") == reply_id:
                return slot

    cleaned = text.strip()
    if cleaned.isdigit():
        index = int(cleaned) - 1
        if 0 <= index < len(slots):
            return slots[index]

    parsed_time = parse_time_selection(cleaned)
    if parsed_time:
        selected_hour, selected_minute = parsed_time
        for slot in slots:
            slot_time = parse_time_selection(slot.get("time_label", ""))
            if not slot_time:
                continue
            if slot_time[0] == selected_hour and slot_time[1] == selected_minute:
                return slot

    lowered = cleaned.lower()
    for slot in slots:
        time_label = (slot.get("time_label") or "").lower()
        display = (slot.get("display") or "").lower()
        if lowered == time_label or lowered in display:
            return slot

    return None


def is_reschedule_intent(lowered_text):
    if not lowered_text:
        return False

    if lowered_text in RESCHEDULE_INTENT_KEYWORDS:
        return True

    if "reschedule" in lowered_text:
        return True

    if "change" in lowered_text and "appointment" in lowered_text:
        return True

    if "move" in lowered_text and "appointment" in lowered_text:
        return True

    return False


def enrich_reschedule_appointments(appointments):
    enriched = []
    for index, appointment in enumerate(appointments, start=1):
        appointment_id = str(appointment.get("appointmentId") or "").strip()
        scheduled_at = appointment.get("scheduledAt")

        if not appointment_id or not scheduled_at:
            continue

        labels = to_slot_labels(scheduled_at)
        enriched.append({
            "reply_id": f"reschedule_apt_{index}",
            "appointment_id": appointment_id,
            "scheduled_at": scheduled_at,
            "scheduled_display": labels["full_label"],
            "time_label": labels["time_label"],
            "date_label": labels["date_label"],
            "reason": appointment.get("reason"),
            "doctor_id": appointment.get("doctorId")
        })

    return enriched


def find_selected_appointment(appointments, text, reply_id):
    if reply_id:
        for appointment in appointments:
            if appointment.get("reply_id") == reply_id:
                return appointment

    cleaned = text.strip()
    if cleaned.isdigit():
        index = int(cleaned) - 1
        if 0 <= index < len(appointments):
            return appointments[index]

    lowered = cleaned.lower()
    for appointment in appointments:
        appointment_id = (appointment.get("appointment_id") or "").lower()
        scheduled_display = (appointment.get("scheduled_display") or "").lower()
        if lowered == appointment_id or lowered in scheduled_display:
            return appointment

    return None


def send_reschedule_appointment_list_message(phone, appointments):
    rows = []
    for appointment in appointments[:10]:
        rows.append({
            "id": appointment["reply_id"],
            "title": appointment["time_label"][:24],
            "description": f"{appointment['date_label']} • {appointment['appointment_id']}"[:72]
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {
                "text": "Select the appointment you want to reschedule."
            },
            "footer": {
                "text": "Pick one appointment"
            },
            "action": {
                "button": "View appointments",
                "sections": [
                    {
                        "title": "Upcoming appointments",
                        "rows": rows
                    }
                ]
            }
        }
    }

    body, status_code = send_whatsapp_payload(payload)
    if status_code >= 400:
        fallback_lines = [
            f"{index}. {appointment['appointment_id']} - {appointment['scheduled_display']}"
            for index, appointment in enumerate(appointments, start=1)
        ]
        send_text_message(
            phone,
            "Upcoming appointments:\n"
            + "\n".join(fallback_lines)
            + "\n\nReply with the appointment number."
        )

    return body, status_code


def build_reschedule_confirmation_summary(state):
    appointment = state.get("reschedule_appointment") or {}
    appointment_id = appointment.get("appointment_id") or "-"
    current_slot = appointment.get("scheduled_display") or "-"
    new_slot = state.get("selected_slot_display") or state.get("preferred_datetime") or "-"

    return (
        f"Reschedule appointment {appointment_id}?\n"
        f"Current slot: {current_slot}\n"
        f"New slot: {new_slot}"
    )


def start_reschedule_flow(phone):
    success, response = fetch_upcoming_appointments(phone, limit=5)
    if not success:
        send_text_message(
            phone,
            f"Could not fetch your upcoming appointments right now. Error: {response.get('message', 'Unknown')}"
        )
        return False

    appointments = enrich_reschedule_appointments(response.get("appointments", []))
    if not appointments:
        send_text_message(phone, "No upcoming active appointments found for this number.")
        return False

    if len(appointments) == 1:
        selected = appointments[0]
        CONVERSATIONS[phone] = {
            "step": "AWAIT_RESCHEDULE_DATE",
            "reschedule_appointment": selected
        }
        send_text_message(
            phone,
            f"Rescheduling {selected['appointment_id']} ({selected['scheduled_display']}). Enter new date (example: {DATE_PROMPT_EXAMPLE})."
        )
        return True

    CONVERSATIONS[phone] = {
        "step": "AWAIT_RESCHEDULE_APPOINTMENT",
        "reschedule_appointments": appointments
    }
    send_reschedule_appointment_list_message(phone, appointments)
    return True


def build_confirmation_summary(state):
    patient_name = state.get("name") or "-"
    patient_phone = state.get("patient_phone") or "-"
    age = state.get("age")
    gender = state.get("gender") or "-"
    address = state.get("address") or "Not provided"
    slot_display = state.get("selected_slot_display") or state.get("preferred_datetime") or "-"
    reason = state.get("reason") or "-"

    return (
        "Please confirm appointment details:\n"
        f"Name: {patient_name}\n"
        f"Phone: {patient_phone}\n"
        f"Age: {age if age is not None else '-'}\n"
        f"Gender: {gender}\n"
        f"Address: {address}\n"
        f"Date & Slot: {slot_display}\n"
        f"Reason: {reason}"
    )


def handle_booking_message(message):
    phone = message["phone"]
    text = (message.get("text") or "").strip()
    lowered = text.lower()
    reply_id = (message.get("reply_id") or "").strip().lower()

    state = CONVERSATIONS.get(phone)
    if not state:
        if is_reschedule_intent(lowered):
            start_reschedule_flow(phone)
            return

        state = {"step": "AWAIT_BOOK_DECISION"}
        contact_name = (message.get("name") or "").strip()
        if contact_name:
            state["name"] = contact_name
        CONVERSATIONS[phone] = state

        if lowered not in YES_KEYWORDS and lowered not in NO_KEYWORDS and reply_id not in {"book_yes", "book_no"}:
            send_book_prompt(phone)
            return

    contact_name = (message.get("name") or "").strip()
    if contact_name and not state.get("name"):
        state["name"] = contact_name

    step = state.get("step", "AWAIT_BOOK_DECISION")

    if lowered in EXIT_KEYWORDS:
        CONVERSATIONS.pop(phone, None)
        send_text_message(phone, "Booking flow cancelled. Send Hi whenever you want to start again.")
        return

    if step == "AWAIT_RESCHEDULE_APPOINTMENT":
        appointments = state.get("reschedule_appointments", [])
        selected_appointment = find_selected_appointment(appointments, text, reply_id)

        if not selected_appointment:
            send_text_message(phone, "Please choose one of your upcoming appointments.")
            return

        state["reschedule_appointment"] = selected_appointment
        state["step"] = "AWAIT_RESCHEDULE_DATE"
        state.pop("reschedule_appointments", None)
        state.pop("slots", None)
        state.pop("preferred_datetime", None)
        state.pop("selected_slot_display", None)
        state.pop("pending_reschedule_text", None)
        CONVERSATIONS[phone] = state
        send_text_message(
            phone,
            f"Rescheduling {selected_appointment['appointment_id']} ({selected_appointment['scheduled_display']}). Enter new date (example: {DATE_PROMPT_EXAMPLE})."
        )
        return

    if step == "AWAIT_RESCHEDULE_DATE":
        requested_date = parse_booking_date(text)
        if not requested_date:
            send_text_message(phone, "Invalid date. Please enter like 10 April or 2026-04-10.")
            return

        selected_appointment = state.get("reschedule_appointment") or {}
        appointment_id = selected_appointment.get("appointment_id")
        doctor_id = selected_appointment.get("doctor_id")

        if not appointment_id:
            if start_reschedule_flow(phone):
                return
            CONVERSATIONS.pop(phone, None)
            send_text_message(phone, "Could not identify the appointment to reschedule. Please type reschedule again.")
            return

        date_iso = requested_date.isoformat()
        requested_date_label = requested_date.strftime("%d %B")
        success, slot_response = fetch_available_slots(
            booking_date=date_iso,
            limit=SLOT_LIST_LIMIT,
            doctor_id=doctor_id,
            exclude_appointment_id=appointment_id
        )
        raw_slots = slot_response.get("slots", []) if success else []
        slots = enrich_slot_choices(raw_slots)

        if not success:
            send_text_message(
                phone,
                f"Could not fetch available slots right now. Please enter date again. Error: {slot_response.get('message', 'Unknown')}"
            )
            return

        if not slots:
            send_text_message(phone, f"No available slots on {requested_date_label}. Enter another date.")
            return

        state["step"] = "AWAIT_RESCHEDULE_SLOT"
        state["requested_date"] = date_iso
        state["requested_date_label"] = requested_date_label
        state["slots"] = slots
        state.pop("preferred_datetime", None)
        state.pop("selected_slot_display", None)
        state.pop("pending_reschedule_text", None)
        CONVERSATIONS[phone] = state
        send_slot_list_message(phone, requested_date_label, slots)
        return

    if step == "AWAIT_RESCHEDULE_SLOT":
        if lowered in RESCHEDULE_KEYWORDS:
            state["step"] = "AWAIT_RESCHEDULE_DATE"
            state.pop("slots", None)
            state.pop("preferred_datetime", None)
            state.pop("selected_slot_display", None)
            state.pop("pending_reschedule_text", None)
            CONVERSATIONS[phone] = state
            send_text_message(phone, f"Enter new date for rescheduling (example: {DATE_PROMPT_EXAMPLE}).")
            return

        slots = state.get("slots", [])
        selected_slot = find_selected_slot(slots, text, reply_id)

        if not selected_slot:
            send_text_message(phone, "Please choose one of the available slots from the list.")
            return

        state["step"] = "AWAIT_RESCHEDULE_CONFIRM"
        state["preferred_datetime"] = selected_slot["iso"]
        state["selected_slot_display"] = selected_slot["display"]
        summary_text = build_reschedule_confirmation_summary(state)
        state["pending_reschedule_text"] = summary_text
        CONVERSATIONS[phone] = state
        send_confirmation_prompt(phone, summary_text)
        return

    if step == "AWAIT_RESCHEDULE_CONFIRM":
        if lowered in RESCHEDULE_KEYWORDS or reply_id == "confirm_reschedule":
            state["step"] = "AWAIT_RESCHEDULE_DATE"
            state.pop("slots", None)
            state.pop("preferred_datetime", None)
            state.pop("selected_slot_display", None)
            state.pop("pending_reschedule_text", None)
            CONVERSATIONS[phone] = state
            send_text_message(phone, f"Enter new date for rescheduling (example: {DATE_PROMPT_EXAMPLE}).")
            return

        if lowered in YES_KEYWORDS or reply_id == "confirm_yes":
            selected_appointment = state.get("reschedule_appointment") or {}
            appointment_id = selected_appointment.get("appointment_id")
            preferred_datetime = state.get("preferred_datetime")

            if not appointment_id or not preferred_datetime:
                state["step"] = "AWAIT_RESCHEDULE_DATE"
                CONVERSATIONS[phone] = state
                send_text_message(phone, f"Enter new date for rescheduling (example: {DATE_PROMPT_EXAMPLE}).")
                return

            success, response = create_reschedule_request(
                phone=phone,
                appointment_id=appointment_id,
                preferred_datetime=preferred_datetime,
                whatsapp_message_id=message.get("message_id")
            )

            if success:
                old_slot = selected_appointment.get("scheduled_display", "-")
                new_slot = state.get("selected_slot_display", preferred_datetime)
                send_text_message(
                    phone,
                    "Appointment rescheduled ✅\n"
                    f"Ref: {appointment_id}\n"
                    f"Previous: {old_slot}\n"
                    f"New: {new_slot}"
                )
                CONVERSATIONS.pop(phone, None)
                return

            error_message = response.get("message", "Unknown error")
            if "already booked" in str(error_message).lower():
                state["step"] = "AWAIT_RESCHEDULE_DATE"
                state.pop("slots", None)
                state.pop("preferred_datetime", None)
                state.pop("selected_slot_display", None)
                state.pop("pending_reschedule_text", None)
                CONVERSATIONS[phone] = state
                send_text_message(phone, "That slot was just booked. Please enter another date.")
                return

            send_text_message(phone, f"Could not reschedule appointment right now. Error: {error_message}")
            return

        fallback_summary = state.get("pending_reschedule_text") or build_reschedule_confirmation_summary(state)
        send_confirmation_prompt(phone, fallback_summary)
        return

    if step == "AWAIT_BOOK_DECISION":
        if is_reschedule_intent(lowered):
            start_reschedule_flow(phone)
            return

        if lowered in YES_KEYWORDS or reply_id == "book_yes":
            state["step"] = "AWAIT_NAME"
            CONVERSATIONS[phone] = state
            send_text_message(
                phone,
                "Please share the patient's full name."
            )
        elif lowered in NO_KEYWORDS or reply_id == "book_no":
            CONVERSATIONS.pop(phone, None)
            send_text_message(phone, "Okay. Send Hi whenever you want to book an appointment.")
        else:
            send_book_prompt(phone)
        return

    if step == "AWAIT_NAME":
        patient_name = text.strip()
        if not patient_name:
            send_text_message(phone, "Name is required. Please enter the patient's full name.")
            return

        state["name"] = patient_name
        state["step"] = "AWAIT_PHONE"
        CONVERSATIONS[phone] = state
        send_text_message(phone, "Please enter patient phone number.")
        return

    if step == "AWAIT_PHONE":
        patient_phone = normalize_phone(text)
        if len(patient_phone) < 10:
            send_text_message(phone, "Enter a valid phone number with at least 10 digits.")
            return

        state["patient_phone"] = patient_phone
        state["step"] = "AWAIT_AGE"
        CONVERSATIONS[phone] = state
        send_text_message(phone, "Please enter patient age.")
        return

    if step == "AWAIT_AGE":
        age = parse_age_input(text)
        if age is None:
            send_text_message(phone, "Age must be a number between 1 and 120.")
            return

        state["age"] = age
        state["step"] = "AWAIT_GENDER"
        CONVERSATIONS[phone] = state
        send_text_message(phone, "Please enter gender (Male/Female/Other).")
        return

    if step == "AWAIT_GENDER":
        gender = parse_gender_input(text)
        if not gender:
            send_text_message(phone, "Please enter gender as Male, Female, or Other.")
            return

        state["gender"] = gender
        state["step"] = "AWAIT_ADDRESS"
        CONVERSATIONS[phone] = state
        send_text_message(phone, "Please enter address (optional). Reply 'skip' to continue.")
        return

    if step == "AWAIT_ADDRESS":
        address = text.strip()
        state["address"] = None if not address or lowered in SKIP_KEYWORDS else address
        state["step"] = "AWAIT_DATE"
        state.pop("slots", None)
        state.pop("preferred_datetime", None)
        state.pop("selected_slot_display", None)
        state.pop("reason", None)
        state.pop("pending_confirmation_text", None)
        CONVERSATIONS[phone] = state
        send_text_message(phone, f"Enter date for appointment (example: {DATE_PROMPT_EXAMPLE}).")
        return

    if step == "AWAIT_DATE":
        requested_date = parse_booking_date(text)
        if not requested_date:
            send_text_message(phone, "Invalid date. Please enter like 10 April or 2026-04-10.")
            return

        date_iso = requested_date.isoformat()
        requested_date_label = requested_date.strftime("%d %B")
        success, slot_response = fetch_available_slots(booking_date=date_iso, limit=SLOT_LIST_LIMIT)
        raw_slots = slot_response.get("slots", []) if success else []
        slots = enrich_slot_choices(raw_slots)

        if not success:
            send_text_message(
                phone,
                f"Could not fetch slots right now. Please enter date again. Error: {slot_response.get('message', 'Unknown')}"
            )
            return

        if not slots:
            send_text_message(
                phone,
                f"No slots available on {requested_date_label}. Enter another date."
            )
            return

        state["step"] = "AWAIT_SLOT"
        state["requested_date"] = date_iso
        state["requested_date_label"] = requested_date_label
        state["slots"] = slots
        state.pop("preferred_datetime", None)
        state.pop("selected_slot_display", None)
        state.pop("pending_confirmation_text", None)
        CONVERSATIONS[phone] = state
        send_slot_list_message(phone, requested_date_label, slots)
        return

    if step == "AWAIT_SLOT":
        if lowered in RESCHEDULE_KEYWORDS:
            state["step"] = "AWAIT_DATE"
            state.pop("slots", None)
            state.pop("preferred_datetime", None)
            state.pop("selected_slot_display", None)
            CONVERSATIONS[phone] = state
            send_text_message(phone, f"Enter date for appointment (example: {DATE_PROMPT_EXAMPLE}).")
            return

        slots = state.get("slots", [])
        selected_slot = find_selected_slot(slots, text, reply_id)

        if not selected_slot:
            send_text_message(phone, "Please choose one of the available slots from the list.")
            return

        state["step"] = "AWAIT_REASON"
        state["preferred_datetime"] = selected_slot["iso"]
        state["selected_slot_display"] = selected_slot["display"]
        state.pop("pending_confirmation_text", None)
        CONVERSATIONS[phone] = state
        send_text_message(phone, "Please enter chief complaint or reason for visit.")
        return

    if step == "AWAIT_REASON":
        reason = text.strip()
        if not reason:
            send_text_message(phone, "Chief complaint/reason is required. Please enter it to continue.")
            return

        state["reason"] = reason
        state["step"] = "AWAIT_CONFIRM"
        confirmation_summary = build_confirmation_summary(state)
        state["pending_confirmation_text"] = confirmation_summary
        CONVERSATIONS[phone] = state
        send_confirmation_prompt(phone, confirmation_summary)
        return

    if step == "AWAIT_CONFIRM":
        if lowered in RESCHEDULE_KEYWORDS or reply_id == "confirm_reschedule":
            state["step"] = "AWAIT_DATE"
            state.pop("slots", None)
            state.pop("preferred_datetime", None)
            state.pop("selected_slot_display", None)
            state.pop("pending_confirmation_text", None)
            CONVERSATIONS[phone] = state
            send_text_message(phone, f"Enter date for appointment (example: {DATE_PROMPT_EXAMPLE}).")
            return

        if lowered in YES_KEYWORDS or reply_id == "confirm_yes":
            preferred_datetime = state.get("preferred_datetime")
            if not preferred_datetime:
                state["step"] = "AWAIT_DATE"
                CONVERSATIONS[phone] = state
                send_text_message(phone, f"Enter date for appointment (example: {DATE_PROMPT_EXAMPLE}).")
                return

            success, response = create_appointment_request(
                patient_name=state.get("name"),
                patient_phone=state.get("patient_phone") or phone,
                age=state.get("age"),
                gender=state.get("gender"),
                address=state.get("address"),
                preferred_datetime=preferred_datetime,
                reason=state.get("reason"),
                whatsapp_message_id=message.get("message_id"),
                status="CONFIRMED"
            )

            if success:
                appointment_id = response.get("appointmentId", "")
                slot_display = state.get("selected_slot_display", preferred_datetime)
                confirmation_text = f"Appointment confirmed ✅\nSlot: {slot_display}"
                if appointment_id:
                    confirmation_text = f"{confirmation_text}\nRef: {appointment_id}"

                send_text_message(phone, confirmation_text)
                CONVERSATIONS.pop(phone, None)
                return

            error_message = response.get("message", "Unknown error")
            if "already booked" in str(error_message).lower():
                state["step"] = "AWAIT_DATE"
                state.pop("slots", None)
                state.pop("preferred_datetime", None)
                state.pop("selected_slot_display", None)
                CONVERSATIONS[phone] = state
                send_text_message(phone, "That slot was just booked. Please enter another date.")
                return

            send_text_message(phone, f"Could not confirm appointment right now. Error: {error_message}")
            return

        fallback_summary = state.get("pending_confirmation_text") or build_confirmation_summary(state)
        send_confirmation_prompt(
            phone,
            fallback_summary
        )
        return

    CONVERSATIONS[phone] = {"step": "AWAIT_BOOK_DECISION", "name": state.get("name")}
    send_book_prompt(phone)


@app.route("/send-message", methods=["POST"])
def send_message():
    data = request.get_json(silent=True) or {}
    recipient = normalize_phone(data.get("to"))

    if not recipient:
        return jsonify({"message": "Missing recipient phone in 'to'"}), 400

    custom_text = data.get("text")
    if custom_text:
        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "text",
            "text": {
                "body": str(custom_text)
            }
        }
    else:
        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "template",
            "template": {
                "name": "hello_world",
                "language": {
                    "code": "en_US"
                }
            }
        }

    body, status_code = send_whatsapp_payload(payload)
    return jsonify(body), status_code


@app.route("/webhook", methods=["GET"])
def verify_webhook():
    # Meta should send hub.mode/hub.verify_token/hub.challenge.
    # Accept underscore variants as a fallback for proxy-reshaped query params.
    mode = request.args.get("hub.mode") or request.args.get("hub_mode")
    token = request.args.get("hub.verify_token") or request.args.get("hub_verify_token")
    challenge = request.args.get("hub.challenge") or request.args.get("hub_challenge")

    if mode == "subscribe" and VERIFY_TOKEN and token == VERIFY_TOKEN:
        return challenge or "OK", 200

    if not VERIFY_TOKEN:
        return jsonify({"error": "WHATSAPP_VERIFY_TOKEN is not configured"}), 500

    return jsonify({
        "error": "Verification failed. Use WHATSAPP_VERIFY_TOKEN as the Verify Token in Meta webhook settings."
    }), 403


@app.route("/webhook", methods=["POST"])
def webhook_messages():
    payload = request.get_json(silent=True) or {}

    if payload.get("object") != "whatsapp_business_account":
        app.logger.warning("Unexpected webhook object received: %s", payload.get("object"))

    incoming_messages = extract_messages(payload)
    status_updates = extract_status_updates(payload)

    if incoming_messages:
        app.logger.info("Webhook message count: %s", len(incoming_messages))
    elif status_updates:
        app.logger.warning("Webhook received status updates without messages: %s", len(status_updates))
    else:
        app.logger.warning("Webhook payload had no messages or status updates.")

    for status_update in status_updates:
        if status_update.get("status") != "failed":
            continue

        first_error = (status_update.get("errors") or [{}])[0]
        app.logger.error(
            "WhatsApp delivery failed (to=%s, code=%s, title=%s, details=%s)",
            status_update.get("recipient_id"),
            first_error.get("code"),
            first_error.get("title"),
            first_error.get("details") or first_error.get("message")
        )

    for incoming in incoming_messages:
        handle_booking_message(incoming)

    return jsonify({
        "status": "received",
        "processedMessages": len(incoming_messages),
        "statusUpdates": len(status_updates)
    }), 200


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "OK",
        "verifyTokenConfigured": bool(VERIFY_TOKEN),
        "phoneNumberIdConfigured": bool(PHONE_NUMBER_ID),
        "bookingSecretConfigured": bool(BOOKING_SHARED_SECRET)
    }), 200


if __name__ == "__main__":
    app.logger.info(
        "Starting WhatsApp webhook server on %s:%s (debug=%s)",
        WHATSAPP_HOST,
        WHATSAPP_PORT,
        WHATSAPP_DEBUG
    )
    app.run(host=WHATSAPP_HOST, port=WHATSAPP_PORT, debug=WHATSAPP_DEBUG, use_reloader=False)