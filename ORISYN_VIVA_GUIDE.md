# 🦷 ORISYN — COMPLETE VIVA PREPARATION GUIDE

## QUICK SUMMARY

**Orisyn** is an AI-powered dental clinic management system that automates clinical documentation. It records doctor-patient consultations, transcribes them with speaker diarization using Deepgram, and extracts structured Electronic Medical Records using Google Gemini.

### Tech Stack
- **Frontend**: React + TypeScript (Electron)
- **Backend**: Node.js/Express + Prisma + SQLite
- **AI**: Python FastAPI + Deepgram + Google Gemini
- **Sync**: Supabase with SyncOutbox pattern
- **Integrations**: WhatsApp, UPI, Ngrok

### Key Features
1. Real-time audio recording with speaker identification
2. Automatic transcription with 95% accuracy
3. AI-powered EMR extraction
4. Multi-clinic synchronization
5. WhatsApp appointment booking
6. Role-based access control (Doctor, Receptionist, Admin)
7. Offline-first operation with cloud sync

---

## OPENING STATEMENT (MEMORIZE THIS!)

> "Orisyn is an AI-powered dental clinic management system that automates clinical documentation. It records doctor-patient consultations, uses Deepgram's nova-2 model for speech-to-text transcription with speaker diarization, then sends the transcript to Google Gemini to extract structured Electronic Medical Records. The system manages appointments, billing, patient records, and user roles through a Node.js/Express backend with Prisma ORM and SQLite. It's packaged as a desktop application using Electron for cross-platform support. A Supabase-based sync engine ensures multi-clinic data synchronization using an offline-first SyncOutbox pattern."

---

## COMPLETE WORKFLOW (END-TO-END)

```
1. Doctor launches app → checks localStorage for JWT
2. Logs in → gets role-based dashboard
3. Selects patient → clicks "Start Recording"
4. Microphone captures audio (16kHz, mono)
5. Stops recording → sends to Deepgram
6. Gets transcript with speaker labels
7. Sends to Gemini → extracts EMR JSON
8. Doctor reviews → saves visit
9. Record published to SyncOutbox
10. Sync engine pushes to Supabase (every 5 seconds)
11. Other devices receive updated data
```

---

## WHY EACH TECHNOLOGY WAS CHOSEN

| Technology | Why Chosen |
|---|---|
| **Electron** | Cross-platform desktop app + offline capability + native microphone access |
| **React + TypeScript** | Type safety + component-based UI + large ecosystem |
| **SQLite** | Offline-first, no server needed, perfect for single-clinic deployment |
| **Prisma** | Type-safe ORM, prevents SQL injection, auto-migrations |
| **Deepgram nova-2** | 95% accuracy, speaker diarization, faster than alternatives |
| **Google Gemini** | Best cost/accuracy balance for medical context understanding |
| **Supabase** | Open-source Firebase alternative, better SQL support |
| **WhatsApp API** | Most popular messaging platform in India |

---

## 5 KEY DESIGN PATTERNS YOU MUST KNOW

### 1. Outbox Pattern
- Write to SyncOutbox first, sync engine delivers to Supabase later
- Ensures offline capability
- Automatic retry on failure
- Atomic operations

### 2. Speaker Diarization
- Deepgram identifies who spoke when
- Doctor = Speaker 0, Patient = Speaker 1
- Helps Gemini understand context

### 3. JWT Authentication
- Stateless tokens with 24-hour expiry
- Payload: {id, role, clinicId, exp}
- Signature prevents tampering
- Stored in localStorage

### 4. Role-Based Access Control
- DOCTOR: Can record, create visits
- RECEPTIONIST: Can manage appointments, register patients
- ADMIN: Can manage users, view analytics

### 5. Polling Sync
- Every 5 seconds
- Push mutations to Supabase
- Pull changes from Supabase
- Apply to local SQLite

---

## 7 SERVICES & THEIR PORTS

| Service | Language | Port | Purpose |
|---|---|---|---|
| Frontend | React/TS | 5173 | User interface |
| Backend | Node.js | 4000 | Business logic + DB |
| AI Service | Python | 8000 | Recording + AI |
| AI Backend | Node.js | 3000 | Suggestions (MongoDB) |
| WhatsApp | Python | 5000 | WhatsApp webhook |
| Ngrok | Node.js | — | Public tunnel |
| UPI Pay | Node.js | — | Payments |

---

## TOP 40 VIVA QUESTIONS & ANSWERS

### Architecture Questions

**Q1: What is the overall architecture of Orisyn?**
A: Microservices + monolithic hybrid. Frontend is React/TypeScript in Electron. Backend is Node.js/Express with Prisma ORM and SQLite. AI service is Python FastAPI with Deepgram and Google Gemini. Supabase provides cloud sync. Separate services for WhatsApp, UPI, and Flask backend.

**Q2: Why did you choose Electron for the frontend?**
A: Electron provides cross-platform support (Windows, Mac, Linux) from a single React codebase. It also gives us native microphone access, offline capability with local SQLite, and a professional desktop app experience. The clinic needs it to work without internet.

**Q3: Why SQLite instead of PostgreSQL?**
A: SQLite was chosen for simplicity and offline-first operation. It requires no server setup, works as a single file, and is perfect for a single-clinic deployment. For multi-user concurrent access (50+ simultaneous users), PostgreSQL would be necessary. The Supabase sync engine provides the cloud layer.

**Q4: What is the SyncOutbox pattern and why is it used?**
A: SyncOutbox is a table that acts as a queue for data mutations. When any data changes, instead of calling Supabase directly, we first write to SyncOutbox. The sync engine polls this table every 5 seconds and pushes to Supabase. Benefits: (1) offline capability, (2) reliability with automatic retry, (3) atomic operations.

**Q5: Explain the role-based access control system.**
A: There are 3 roles: DOCTOR, RECEPTIONIST, and ADMIN. The authMiddleware(allowedRoles) function validates the JWT token and checks if the user's role is in the allowed list. The frontend also conditionally renders routes based on role.

**Q6: Why does the frontend use localStorage instead of cookies?**
A: For Electron desktop apps, localStorage is simpler without domain restrictions. The JWT token is stored in localStorage and included in the Authorization header for all API calls. Downside: XSS attacks can steal localStorage tokens.

**Q7: How does the sync engine handle conflicts?**
A: Uses a timestamp-based approach. When pulling from Supabase, it uses a cursor (stored in SyncState) to only fetch records updated after the last sync. For push, the SyncOutbox has a unique constraint on (entity, recordKey), so multiple changes to the same record are coalesced into one operation.

**Q8: Explain the subscription management system.**
A: The subscription service is polled every 30 seconds from the frontend. The /subscription/status endpoint returns {outOfLimit, message, reasonCodes, upgradeUrl}. If outOfLimit is true, a modal is shown blocking the UI.

### AI/ML Questions

**Q9: What is speaker diarization and how is it used?**
A: Speaker diarization identifies which speaker said each word in an audio recording. Deepgram analyzes acoustic features like pitch, tone, and speaking patterns to label each utterance as Speaker 0 or Speaker 1. In a dental consultation, Speaker 0 is typically the doctor and Speaker 1 is the patient.

**Q10: What is the Deepgram nova-2 model?**
A: Nova-2 is Deepgram's latest automatic speech recognition model, based on a transformer architecture. It achieves approximately 95% accuracy (5% word error rate) on clean speech. It supports punctuation, smart formatting, and speaker diarization.

**Q11: How does Gemini extract EMR data?**
A: We use prompt engineering to send Gemini the transcript along with a JSON schema specifying exactly what fields to extract. The prompt includes rules: "only include data actually mentioned," "return raw JSON only." Gemini fills in the schema based on the transcript.

**Q12: What is prompt engineering?**
A: Prompt engineering is crafting the input text sent to an LLM to get the desired output. We: (1) set the role context, (2) specify the task, (3) provide the exact JSON schema to fill, (4) add explicit rules. Good prompts significantly improve output quality.

**Q13: What are the limitations of using Gemini for medical extraction?**
A: Key limitations: (1) Hallucination — may invent diagnoses not mentioned, (2) It's a general-purpose LLM, not a specialized medical model, (3) API dependency — requires internet and API key, (4) Cost — paid per token, (5) Occasional malformed JSON.

**Q14: Why 16kHz sample rate for audio recording?**
A: 16kHz is the standard for speech recognition systems. Human speech primarily contains frequencies below 8kHz (Nyquist theorem). Higher sample rates don't improve speech recognition accuracy and waste bandwidth. Deepgram's nova-2 is optimized for 16kHz input.

### Security Questions

**Q15: How are passwords stored?**
A: Passwords are hashed using bcrypt with 10 salt rounds: bcrypt.hash(password, 10). bcrypt is a one-way hash — you can't reverse it. On login, bcrypt.compare(plainPassword, hashedPassword) returns true/false. Passwords are NEVER stored in plain text.

**Q16: Explain JWT structure and security.**
A: JWT has 3 parts: Header (algorithm), Payload (user data: id, role, clinicId, exp), Signature (HMAC-SHA256 of header.payload using JWT_SECRET). The signature prevents tampering. If anyone modifies the payload, the signature won't match. Token expires in 24 hours.

**Q17: What security vulnerabilities exist in the current system?**
A: Current vulnerabilities: (1) No HTTPS — data transmitted in plain text in development, (2) Medical data not encrypted at rest in SQLite, (3) JWT in localStorage is vulnerable to XSS attacks, (4) No rate limiting — brute force attacks on /auth/login are possible, (5) No audit logging.

**Q18: How is the WhatsApp booking API secured?**
A: The WhatsApp booking endpoint doesn't use JWT (since it's called by the WhatsApp service, not by authenticated users). Instead, it uses a shared secret: the WhatsApp service sends X-Booking-Secret header, and the backend validates it matches WHATSAPP_BOOKING_SECRET env var.

### Database Questions

**Q19: Explain the Visit table schema.**
A: The Visit table stores consultation records with: visitId (human-readable unique ID), patientId (FK to Patient), doctorId (FK to User), visitType (NEW or FOLLOW_UP), clinical data fields (symptoms, diagnosis, treatmentPlan), clinicalStatus (IN_PROGRESS or CLINICALLY_COMPLETED), and paymentStatus (NOT_BILLED, PARTIALLY_PAID, PAID).

**Q20: What is the purpose of the patientId field (vs the id field) in Patient?**
A: The id is an auto-incrementing integer — an internal database key used for fast joins and foreign key references. The patientId is a human-readable string like "PAT-XYZ123" — used in URLs, UI display, and external references. This dual-ID pattern is common.

**Q21: Why are symptoms stored as String in Visit, not as a separate table?**
A: This is actually a design weakness. Storing symptoms as text makes it impossible to query specific symptoms (e.g., "all patients with fever"). A better design would have a separate Symptoms table with visitId FK.

**Q22: Explain the Appointment table's nullable fields.**
A: patientId and doctorId are nullable because WhatsApp-booked appointments may come from unknown patients (no account yet). patientPhone is always required for WhatsApp appointments. Once a receptionist links the appointment to an existing patient, patientId is populated.

### Performance Questions

**Q23: What is Promise.all and why is it used?**
A: Promise.all([p1, p2, p3]) runs multiple async operations in PARALLEL instead of sequentially. Sequential would take 300ms (3 × 100ms). Parallel takes 100ms (all run simultaneously). Critical for performance.

**Q24: What are the performance bottlenecks?**
A: Main bottlenecks: (1) Deepgram transcription: 2-5 seconds, (2) Gemini EMR extraction: 2-10 seconds, (3) SQLite concurrency: limited to ~10-20 simultaneous writers, (4) Sync engine polling: 5-second interval, (5) No caching.

**Q25: How would you add caching?**
A: I'd add Redis. For frequently accessed data like patient lists: check cache first, if miss query SQLite, store in cache with TTL. Cache invalidated on any patient update.

### WhatsApp Integration Questions

**Q26: Explain the WhatsApp booking flow step-by-step.**
A: (1) Patient sends "Book appointment" to clinic WhatsApp number, (2) Meta WhatsApp Cloud API receives message, (3) Meta sends HTTP POST to webhook URL (ngrok tunnel), (4) ngrok forwards to localhost:5000, (5) whatsapp.py receives the webhook, (6) In-memory conversation state machine determines current step, (7) Appropriate response sent back to patient, (8) After all info collected, sends POST to /appointments/whatsapp/request with secret header, (9) Backend creates REQUESTED appointment, (10) Confirmation sent to patient.

**Q27: What is ngrok and why is it needed?**
A: ngrok creates a public HTTPS tunnel to your local server. WhatsApp webhooks require a publicly accessible URL — you can't use localhost. ngrok provides https://xxxx.ngrok.io which forwards to http://localhost:5000. The URL is configured in Meta WhatsApp settings as the webhook URL.

**Q28: What is the weakness of in-memory conversation state in whatsapp.py?**
A: The conversation state is stored in a Python dictionary in memory. Problem: if the server restarts, all ongoing conversations are lost. If two doctors share the WhatsApp account, conversations from different patients might interfere.

### Conceptual Questions

**Q29: What is the difference between authentication and authorization?**
A: Authentication = "Who are you?" — verified by login (JWT token). Authorization = "What can you do?" — verified by role check (authMiddleware). Orisyn uses JWT for authentication and role-based middleware for authorization.

**Q30: What is ACID in databases?**
A: ACID: Atomicity (transaction completes fully or not at all), Consistency (database stays valid after transaction), Isolation (concurrent transactions don't interfere), Durability (committed data survives crashes). Prisma's $transaction() API provides ACID guarantees.

**Q31: What is an ORM and why use Prisma?**
A: ORM (Object-Relational Mapper) converts between database records and programming objects. Without it, you'd write raw SQL. With Prisma: type safety, prevents SQL injection, auto-migrations, readable query syntax. Downside: some performance overhead.

**Q32: Explain REST vs alternatives.**
A: REST uses HTTP methods (GET, POST, PUT, DELETE) with resource-based URLs. Orisyn uses REST. Alternative: GraphQL (single endpoint, client specifies exact fields needed). For Orisyn's simple use case, REST is appropriate.

**Q33: What is the Event Loop in Node.js?**
A: Node.js is single-threaded but handles concurrency through the event loop. When an async operation is called, Node hands it off and continues processing other requests. When the async operation completes, its callback is added to the event queue.

### Improvement Questions

**Q34: What are the top 5 things you would improve?**
A: (1) Migrate to PostgreSQL for production scalability, (2) Encrypt medical data at rest (AES-256), (3) Add Redis caching for frequently accessed data, (4) Implement comprehensive audit logging for compliance, (5) Add comprehensive test coverage.

**Q35: How would you make the system HIPAA compliant?**
A: HIPAA compliance requires: (1) Encryption at rest (AES-256), (2) Encryption in transit (TLS/HTTPS), (3) Audit logs for all data access, (4) Access controls with minimum necessary access, (5) Business Associate Agreements with Deepgram, Gemini, Supabase, (6) Patient consent for AI processing, (7) Data breach notification procedures, (8) Regular security assessments.

**Q36: How would you scale to 100 clinics?**
A: (1) Move from SQLite to PostgreSQL, (2) Each clinic identified by clinicId — already in schema, (3) Row-level security in Supabase to isolate clinic data, (4) API gateway for routing, (5) Load balancing across multiple backend instances, (6) Dedicated sync channels per clinic, (7) Rate limiting per clinic subscription tier.

### Cross-Examination Questions

**Q37: If you had to redo this project, what would you change architecturally?**
A: I would design it as microservices from the start rather than the hybrid approach. I'd use PostgreSQL instead of SQLite, implement HTTPS and encryption from day one, and add a proper message queue (like BullMQ) for the sync engine instead of polling.

**Q38: How is this different from existing clinic management software?**
A: Most clinic software (like Dentrix, Curve Dental) requires manual data entry. Orisyn's key differentiator is the AI pipeline: record → transcribe → extract. This reduces documentation time from 15-20 minutes to under 2 minutes.

**Q39: What would happen if Deepgram API goes down?**
A: The system would fail to transcribe. The error is caught and an HTTPException is raised. The frontend shows an error message. The doctor would need to manually type notes. A robust solution would include offline transcription using a local Whisper model as fallback.

**Q40: What's the difference between sync and real-time?**
A: Orisyn's sync is polling-based: checks for changes every 5 seconds. Real-time would use WebSockets or Supabase Realtime subscriptions to push changes instantly (0 delay). The current approach adds up to 5-second delay before other devices see changes.

---

## STRENGTHS & WEAKNESSES

### ✅ STRENGTHS
1. Complete feature set covering entire clinic workflow
2. Real AI-powered automated documentation
3. Offline-first with cloud sync
4. Modern stack (React/TypeScript/Electron/Prisma)
5. Proper RBAC for different clinic staff
6. Good service separation
7. Error handling throughout
8. Built-in subscription system
9. Novel WhatsApp integration
10. Correct speaker diarization implementation

### ❌ WEAKNESSES
1. No data encryption at rest in SQLite
2. SQLite limited to ~10-20 concurrent users
3. Global state in AI service (_transcript) not thread-safe
4. No rate limiting on login endpoint
5. No audit trail for compliance
6. No HTTPS enforcement in development
7. In-memory WhatsApp state lost on restart
8. Limited test coverage
9. No offline queue for UI actions
10. 30-second subscription check delay

---

## FINAL VIVA CHECKLIST

- [ ] Memorize opening statement
- [ ] Understand complete workflow end-to-end
- [ ] Know why each technology was chosen
- [ ] Understand all 5 design patterns
- [ ] Be able to explain AI pipeline in detail
- [ ] Know database schema and relationships
- [ ] Understand authentication and authorization flows
- [ ] Know the 7 services and their ports
- [ ] Be prepared to discuss weaknesses and improvements
- [ ] Practice explaining architecture to non-technical person
- [ ] Know answers to 40+ common viva questions
- [ ] Be ready for cross-examination questions

---

**Good luck with your viva! 🎓**
