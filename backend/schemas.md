# Enterprise Learning System — Database Schemas

> Language-agnostic schema definitions for MongoDB collections.
> Use these as the source of truth when implementing in Python (Pydantic), Node.js (Mongoose), or any other runtime.

---

## Collections Overview

| Collection | Document | Description |
|---|---|---|
| `job_levels` | JobLevel | IC level definitions (L59–L70) |
| `skills` | Skill | Skill catalog (slug-keyed) |
| `courses` | Course | Course catalog with ordered list of module IDs |
| `course_progress` | CourseProgress | Per-user, per-course progress (only `completed_topics` is canonical) |
| `modules` | Module | Module + ordered list of topic IDs (reusable across courses) |
| `topics` | Topic | Standalone reusable learning content (slug-keyed) |
| `job_roles` | JobRole | Role definitions with required courses/skills |
| `users` | User | User accounts with org relationships |
| `user_credentials` | UserCredentials | Auth secrets, kept off the hot path |
| `work_signals` | WorkSignals | Per-user Work IQ signals + learning preferences (meeting load, focus windows, study slot) |
| `assessment_schedules` | AssessmentSchedule | Schedule + lifecycle status of an exam attempt |
| `assessment_questions` | AssessmentQuestions | MCQ payload + the learner's selections (1:1 with schedule) |
| `assessment_results` | AssessmentResult | Score + breakdown for completed/expired schedules (1:1) |
| `certifications` | Certification | Per-user issued certifications (recertifications allowed) |
| `chat_conversations` | ChatConversation | Chat session metadata (per-user) |
| `chat_messages` | ChatMessage | Individual chat messages |
| `notifications` | Notification | Persisted notification history |
| `knowledge_sources` | KnowledgeSource | Registry of grounding docs / KB items used by agents (Foundry IQ, MS Learn MCP) |
| `learning_curator_insights` | LearningCuratorInsight | Per-user output of the Learning Path Curator agent |
| `engagement_agent_insights` | EngagementAgentInsight | Per-user output of the Engagement Agent |
| `assessment_agent_insights` | AssessmentAgentInsight | Per-user readiness output of the Assessment Agent |
| `manager_insights_agent_insights` | ManagerInsightsAgentInsight | Per-manager team output |
| `study_plan_generator_insights` | StudyPlanGeneratorInsight | Per-user weekly study plan |
| `agent_cache` | AgentCache | Per-(user, agent) cached envelope output backing the dashboard cards |
| `telemetry_logs` | TelemetryLog | Centralized RAID-tagged service logs (TTL-30d) |

---

## JobLevel

**Collection:** `job_levels`

```js
{
  _id: ObjectId,
  level_id: String,          // "L59", "L60", ..., "L70" (unique)
  level_name: String,        // "SDE", "SDE II", ..., "Technical Fellow"
  schema_version: Int
}
```

**Indexes:** `{ level_id: 1 }` (unique)

---

## Skill

**Collection:** `skills`

```js
{
  _id: ObjectId,
  slug: String,              // kebab-case stable identifier (unique)
                             //   e.g., "kubernetes-aks", "azure-storage"
  name: String,              // display name; not unique
  schema_version: Int,
  created_at: Date,
  updated_at: Date,
  created_by: ObjectId | null,   // ref → users._id
  updated_by: ObjectId | null    // ref → users._id
}
```

**Indexes:** `{ slug: 1 }` (unique), `{ name: 1 }`

The `slug` is the stable join key. Renaming `name` is cheap and does not
collide. Categorisation/grouping is **not** a property of the skill — it
belongs to the consumer (job role / certification skill list).

---

## Course

**Collection:** `courses`

```js
{
  _id: ObjectId,
  course_name:  String,                  // unique
  duration_hours: Number,                // 0 < x ≤ 200 (validated app-side)
  difficulty: String,                    // enum: "beginner" | "intermediate" | "advanced"
  weight: Number,                        // 0.0 ≤ x ≤ 1.0 (clamped on write)
  guidance_doc_location: String,         // path to markdown guidance doc

  certification: {                       // null when course has no cert path
    vendor: String,                      // "Microsoft" | "Google" | "AWS"
    cert_code: String,                   // "AZ-204"
    cert_name: String,
    cert_exam_url: String,
    cert_page: String,
    exam_cost: Number,                   // USD
    level: String,                       // "Fundamentals" | "Associate" | "Expert"
    skills: [ObjectId]                   // refs → skills._id
  } | null,

  prerequisites: [ObjectId],             // refs → courses._id
  modules:       [ObjectId],             // refs → modules._id (display order = array order)

  reference_links: [{ url: String, title: String }],

  course_version: Int,                   // bumped on any structural change
                                         //   (modules[] or any module's topics[])
                                         // course_progress carries the same.

  schema_version: Int,
  created_at: Date,
  updated_at: Date,
  created_by: ObjectId | null,           // ref → users._id
  updated_by: ObjectId | null            // ref → users._id
}
```

**Indexes:** `{ course_name: 1 }` (unique)

**Mutation rules:**
- Adding/removing entries in `modules[]`, or any change to a referenced
  `modules.topics[]`, MUST bump `course_version`.
- A reconciliation job listens for `course_version` bumps and trims invalid
  topic IDs out of every `course_progress.completed_topics` for that course
  (then recomputes `percent_complete`).

---

## CourseProgress

**Collection:** `course_progress`

Created **only when the learner enrolls** — no `not_started` state.
**Canonical state is `completed_topics` only.** Module-completion and
overall-percent are *derived* and cached for fast reads.

```js
{
  _id: ObjectId,
  user_id:    ObjectId,                  // ref → users._id
  course_id:  ObjectId,                  // ref → courses._id
  course_version: Int,                   // course version at last sync
  status: String,                        // enum: "in_progress" | "completed"

  completed_topics: [ObjectId],          // refs → topics._id  (CANONICAL)

  percent_complete: Number,              // (derived, cached) 0–100
  completed_module_count: Number,        // (derived, cached) for sort/filter

  enrolled_at:   Date,
  last_activity: Date,                   // bumped on each topic-completion event
  completed_at:  Date | null,            // set the moment status flips to "completed";
                                         //   null while in_progress
  time_spent_minutes: Number,

  schema_version: Int
}
```

**Indexes:**
- `{ user_id: 1, course_id: 1 }` (unique)
- `{ user_id: 1, status: 1 }`
- `{ user_id: 1, last_activity: -1 }`   ← "My recent learning"
- `{ user_id: 1, completed_at: -1 }` **partial** where `status === "completed"`  ← "recently completed"

**Derivation contract:**
- `percent_complete` = `completed_topics.length / total_course_topics * 100`,
  rounded to 2 decimals; `total_course_topics` is computed from `courses.modules[] → modules.topics[]` at write time.
- `completed_module_count` = number of modules whose `topics[]` is fully covered by `completed_topics`.
- `status` flips to `"completed"` iff `completed_module_count === courses.modules.length`.
- `completed_at` is set in the **same update** as the `status` flip (and never
  re-written if the same write executes twice — use `$cond` / upsert guard so
  recompute jobs don't drift the timestamp).
- All three derived fields are written in the **same update** as the
  `$addToSet` on `completed_topics` (single-document update keeps it atomic).

**Stale `course_version` handling:**
When `course_progress.course_version < courses.course_version`, a background
job reconciles: removes any `topic_id` that no longer exists in the current
course and recomputes the derived fields.

---

## Module

**Collection:** `modules`

A module owns an ordered list of topic IDs. **Reusable across courses.**

```js
{
  _id: ObjectId,
  slug:  String,                         // kebab-case stable identifier (unique)
  title: String,                         // display name (not unique)
  topics: [ObjectId],                    // refs → topics._id (order = array order)
  schema_version: Int,
  created_at: Date,
  updated_at: Date,
  created_by: ObjectId | null,           // ref → users._id
  updated_by: ObjectId | null            // ref → users._id
}
```

**Indexes:** `{ slug: 1 }` (unique), `{ title: 1 }`

Mutating `topics[]` (add/remove) bumps `course_version` on every course that
references this module (admin-service responsibility on save).

---

## Topic

**Collection:** `topics`

Fully **standalone, reusable** learning content. Topics do not know which
modules/courses reference them.

```js
{
  _id: ObjectId,
  slug: String,                          // kebab-case stable identifier (unique)
  topic_name: String,                    // display name (not unique)
  estimated_minutes: Number,             // 0 < x ≤ 600
  content_md: String,                    // ≤ 100,000 chars (validated app-side)
  word_count: Number,                    // (derived, cached) for admin insights
  reference_links: [{ url: String, title: String }],
  key_takeaways: [String],
  schema_version: Int,
  created_at: Date,
  updated_at: Date,
  created_by: ObjectId | null,           // ref → users._id
  updated_by: ObjectId | null            // ref → users._id
}
```

**Indexes:** `{ slug: 1 }` (unique), `{ topic_name: 1 }`

---

## JobRole

**Collection:** `job_roles`

```js
{
  _id: ObjectId,
  role_name: String,                     // unique
  level: ObjectId,                       // ref → job_levels._id
  description: String,
  required_courses: [ObjectId],          // refs → courses._id
  required_skills:  [ObjectId],          // refs → skills._id
  schema_version: Int,
  created_at: Date,
  updated_at: Date,
  created_by: ObjectId | null,           // ref → users._id
  updated_by: ObjectId | null            // ref → users._id
}
```

**Indexes:** `{ role_name: 1 }` (unique), `{ level: 1 }`

---

## User

**Collection:** `users`

```js
{
  _id: ObjectId,
  full_name: String,
  email: String,                         // unique (lowercased on write)
  roles: [String],                       // enum-each: "learner" | "manager" | "admin"
                                         //   non-empty; manager-learners common
  job_role:   ObjectId | null,           // ref → job_roles._id
  reports_to: ObjectId | null,           // ref → users._id
  is_active:  Boolean,
  schema_version: Int,
  created_at: Date,
  updated_at: Date,
  created_by: ObjectId | null,           // ref → users._id
  updated_by: ObjectId | null            // ref → users._id
}
```

**Indexes:**
- `{ email: 1 }` (unique)
- `{ roles: 1 }`                        ← multi-key, covers role filtering
- `{ reports_to: 1 }`                   ← manager → direct reports
- `{ job_role: 1 }`

**Auth secrets** (`password_hash`, etc.) live in `user_credentials`, NOT here,
so reads of the user document never accidentally surface them.

---

## UserCredentials

**Collection:** `user_credentials`

```js
{
  _id: ObjectId,
  user_id: ObjectId,                     // ref → users._id (unique)
  password_hash: String,                 // bcrypt
  password_updated_at: Date,
  last_login_at: Date | null,
  failed_login_attempts: Int,
  locked_until: Date | null,
  schema_version: Int
}
```

**Indexes:** `{ user_id: 1 }` (unique)

Read **only** by the auth path. Application-layer rule: API responses MUST
NOT echo any field from this collection.

---

## WorkSignals

**Collection:** `work_signals`

Per-user **Work IQ** signals (observed work context) + learning preferences
(chosen by the user). One document per user. Sourced from synthetic Work IQ
fixtures in `synthetic-data/collections-synthetic-data/work_signals.json` for the hackathon demo;
in a real deployment this would be hydrated from Microsoft 365 Copilot
Work IQ. Consumed by the **Engagement Agent** and **Study Plan Generator**.

```js
{
  _id: ObjectId,
  user_id: ObjectId,                     // ref → users._id (unique)

  // --- Work IQ signals (observed) ---
  meeting_hours:        Number,          // hours/week in meetings
  focus_hours:          Number,          // hours/week of focus time
  collaboration_hours:  Number,          // hours/week in collaborative work
  peak_focus_window:    String,          // "HH:MM-HH:MM" — observed peak focus
  interruption_density: String,          // enum: "Low" | "Medium" | "High"
  total_work_hours:     Number,          // hours/week total

  // --- Learning preferences (chosen) ---
  preferred_learning_slot: String,       // enum: "Morning" | "Afternoon" | "Evening"
  study_hours_per_week:    Number,       // target study hours/week
  timezone: String,                      // IANA, e.g., "Asia/Kolkata"

  signals_source: String,                // enum: "work_iq" | "synthetic" | "user_provided"
  signals_refreshed_at: Date,            // last time Work IQ signals were synced

  schema_version: Int,
  created_at: Date,
  updated_at: Date,
  created_by: ObjectId | null,           // ref → users._id
  updated_by: ObjectId | null            // ref → users._id
}
```

**Indexes:** `{ user_id: 1 }` (unique)

---

## AssessmentSchedule

**Collection:** `assessment_schedules`

Lifecycle + scheduling record. Generated questions live in
`assessment_questions`; submission outcome lives in `assessment_results`.
**Score/passed are mirrored here on submit** so the history list reads from
one collection.

```js
{
  _id: ObjectId,
  user_id:   ObjectId,                   // ref → users._id
  course_id: ObjectId,                   // ref → courses._id
  course_name: String,                   // snapshot at scheduling
  cert_code:   String,                   // snapshot
  attempt_number: Int,                   // 1, 2, 3... per (user_id, course_id)

  status: String,                        // enum: "pending" | "generating" | "ready"
                                         //       | "in_progress" | "completed"
                                         //       | "expired"   | "failed"

  question_count:   Int,                 // populated when status → "ready"
  duration_minutes: Int,                 // exam window; 0 until ready

  scheduled_at: Date,
  ready_at:     Date | null,
  started_at:   Date | null,
  ends_at:      Date | null,
  submitted_at: Date | null,

  // Mirrored from assessment_results on submit (history view reads only this)
  score_percentage: Number | null,
  passed:           Boolean | null,

  error: String | null,                  // populated when status === "failed"
  updated_at: Date,
  schema_version: Int
}
```

**Indexes:**
- `{ user_id: 1, course_id: 1, attempt_number: 1 }` (unique)
- `{ user_id: 1, submitted_at: -1 }`     ← history list
- `{ status: 1, scheduled_at: 1 }`       ← stuck-job sweeper / expiry cron
- `{ user_id: 1 }` **partial unique** where `status ∈ {pending, generating, ready, in_progress}`
  → enforces "one active schedule per user" at the DB layer.

**`attempt_number` allocation:**
Allocated by computing `max(attempt_number) + 1` over existing rows for
`(user_id, course_id)` (defaulting to `1` when none exist) and inserting the
new schedule. The `(user_id, course_id, attempt_number)` unique index is the
authoritative guard: on `DuplicateKeyError`, the scheduler retries the
allocation (bounded retry — typically resolves in 1–2 attempts under contention).
Do not use a separate counter document; the unique index is the source of truth.

**Status transitions:**

```
pending ──► generating ──► ready ──► in_progress ──► completed
     │            │           │           │
     └─► failed   └─► failed  └─► expired └─► expired
```

---

## AssessmentQuestions

**Collection:** `assessment_questions`

One document per schedule (1:1). Holds the MCQ payload **and** the learner's
selections. `correct_index` and `explanation` are redacted by the API while
the schedule is `in_progress`.

```js
{
  _id: ObjectId,
  schedule_id: ObjectId,                 // ref → assessment_schedules._id (unique)
  user_id:     ObjectId,                 // ref → users._id
  course_id:   ObjectId,                 // ref → courses._id

  questions: [{
    index: Int,                          // 0-based
    kind:  String,                       // discriminator — currently only "mcq".
                                         //   Reserved values for future expansion:
                                         //   "multi_select" | "short_answer" | "code".
                                         //   Adding a new kind is a data change,
                                         //   not a schema migration.
    question: String,                    // stem/prompt
    options:  [String],                  // mcq: exactly 4
    correct_index:  Int,                 // mcq: 0–3 (redacted in-flight)
    selected_index: Int | null,          // mcq: learner's answer (null until submit)
    topic_id: ObjectId,                  // ref → topics._id (CANONICAL)
    topic_name: String,                  // snapshot for display
    explanation: String,                 // redacted in-flight
    citations: [{                        // grounded source(s) backing this question
      source_type: String,               // "foundry_iq" | "ms_learn_mcp" | "grounding_doc"
      source_id:   String,               // resolves to knowledge_sources.doc_id
      title:       String,
      url:         String | null,
      snippet:     String | null,
      score:       Number | null
    }]
  }],

  generated_at: Date,
  schema_version: Int
}
```

**Indexes:** `{ schedule_id: 1 }` (unique), `{ user_id: 1, generated_at: -1 }`

`topic_id` is the **canonical** topic reference; the agent prompt receives
`[{topic_id, topic_name}]` and is required to echo `topic_id`. Unknown IDs
returned by the agent are mapped to a sentinel topic during normalisation.

`citations[]` MUST be non-empty for every generated question — the
assessment service rejects any question payload without at least one
resolvable citation (this is the grounding contract).

---

## AssessmentResult

**Collection:** `assessment_results`

One document per **completed or expired** schedule (1:1). The learner's
actual answers live in `assessment_questions.questions[].selected_index` —
not duplicated here. Joined to `assessment_questions` via `schedule_id`.

```js
{
  _id: ObjectId,
  schedule_id: ObjectId,                 // ref → assessment_schedules._id (unique)
  user_id:     ObjectId,                 // ref → users._id
  course_id:   ObjectId,                 // ref → courses._id

  score_percentage: Number,              // 0–100
  pass_threshold:   Number,              // default 70
  passed: Boolean,
  readiness_level: String,               // "Ready" | "Almost Ready" | "Not Ready"

  correct_count:   Int,
  total_questions: Int,

  per_topic_breakdown: [{                // array — keyed by topic_id, not topic name
    topic_id:   ObjectId,
    topic_name: String,                  // snapshot
    total:   Int,
    correct: Int
  }],
  weak_topic_ids:   [ObjectId],          // refs → topics._id (< 50% correct)
  strong_topic_ids: [ObjectId],          // refs → topics._id (≥ 80% correct)

  proctor: {
    blocked: Boolean,                    // true iff any violation occurred
    violations: [{
      type: String,                      // ProctorViolation enum (below)
      at_seconds:    Int,                // seconds since started_at
      question_index: Int | null,        // which question was on screen
      duration_ms:   Int | null          // e.g., blur duration
    }],
    summary: { [type: String]: Int }     // (derived, cached) violation counts
  },

  time_spent_minutes: Int,
  submitted_at: Date,
  schema_version: Int
}
```

**ProctorViolation enum** (`proctor.violations[].type`):

| Value | Meaning |
|---|---|
| `window_blur` | Browser window/tab lost focus |
| `tab_switch` | Learner switched to another tab |
| `fullscreen_exit` | Learner exited fullscreen |
| `copy_paste` | Copy or paste detected |
| `right_click` | Context menu / right-click |
| `devtools_open` | Browser developer tools opened |
| `multiple_faces` | Webcam saw more than one face |
| `no_face` | Webcam saw no face for >N seconds |
| `audio_detected` | External speech/audio detected |
| `screen_share` | Screen share / external display detected |

**Indexes:**
- `{ schedule_id: 1 }` (unique)
- `{ user_id: 1, course_id: 1, submitted_at: -1 }`

> **Archival:** Old `assessment_questions` docs (>90 days, `submitted_at` set)
> may be moved to `assessment_questions_archive` by a maintenance job to keep
> the hot collection lean. Out of scope for this schema doc; tracked
> operationally.

---

## Certification

**Collection:** `certifications`

Auto-created when an `assessment_result.passed === true`. Self-contained
(snapshots vendor/cert info from `course.certification` at issuance time).
**Recertifications are allowed** — multiple docs per `(user_id, course_id)`.

```js
{
  _id: ObjectId,
  user_id:   ObjectId,                   // ref → users._id
  course_id: ObjectId,                   // ref → courses._id
  course_name: String,                   // snapshot — survives course rename
  assessment_result_id: ObjectId,        // ref → assessment_results._id

  vendor: String,
  cert_code: String,
  cert_name: String,
  cert_exam_url: String,
  cert_page: String,
  exam_cost: Number,
  level: String,                         // "Fundamentals" | "Associate" | "Expert"
  skills: [ObjectId],                    // refs → skills._id (snapshot)

  score: Number,                         // score at issuance
  issued_at: Date,
  valid_until: Date | null,              // null = no expiry
  is_current: Boolean,                   // true on the latest issuance per (user, course)
  schema_version: Int
}
```

**Indexes:**
- `{ user_id: 1, course_id: 1, issued_at: -1 }`
- `{ user_id: 1, is_current: 1 }`         ← "my active certs" view
- `{ assessment_result_id: 1 }` (unique)  ← prevents double-issuance per attempt

When a new cert is issued, the previous `is_current=true` doc for the same
`(user_id, course_id)` is set to `false` in the same write batch.

---

## ChatConversation

**Collection:** `chat_conversations`

Metadata for a chat session. Title auto-derives from the first user message
(≤60 chars).

```js
{
  _id: ObjectId,
  user_id: ObjectId,                     // ref → users._id
  title:   String,                       // ≤200 chars
  created_at:      Date,
  updated_at:      Date,
  last_message_at: Date,
  message_count:   Int,                  // running count, $inc on append
  schema_version:  Int
}
```

**Indexes:** `{ user_id: 1, last_message_at: -1 }`

---

## ChatMessage

**Collection:** `chat_messages`

One document per message.

```js
{
  _id: ObjectId,
  conversation_id: ObjectId,             // ref → chat_conversations._id
  user_id: ObjectId,                     // ref → users._id (denormalised for GDPR scans)
  seq: Int,                              // monotonic per conversation_id, starts at 1
                                         //   allocated atomically via $inc on
                                         //   chat_conversations.message_count
                                         //   (the returned post-increment value)
  role: String,                          // enum: "user" | "assistant"
  content: String,                       // 1–20,000 chars
  agent: String | null,                  // e.g., "learning-curator"
  is_error: Boolean,
  created_at: Date,
  schema_version: Int
}
```

**Indexes:**
- `{ conversation_id: 1, seq: 1 }` (unique) ← canonical message list ordering
- `{ user_id: 1, created_at: -1 }`          ← GDPR delete / per-user cleanup
- *(Optional)* TTL on `created_at` (e.g., 365 days) if retention policy applies

**Ordering contract:** message list reads MUST sort by `seq`, not
`created_at`. `created_at` is informational only and may reorder across
replicas under clock skew. `seq` is allocated by
`findOneAndUpdate({_id: conversation_id}, {$inc: {message_count: 1}}, {returnDocument: "after"})`
before the message insert; the returned `message_count` becomes the new
message's `seq`. The `(conversation_id, seq)` unique index guards against
any double-insert.

---

## Notification

**Collection:** `notifications`

Persisted notification history. Created by the core-service Service Bus
consumer on `notification.create` messages, then pushed via Redis to any
open WebSocket on `els:ws:user:{user_id}`.

```js
{
  _id: ObjectId,
  user_id: ObjectId,                     // ref → users._id
  type: String,                          // free-form category, e.g.,
                                         //   "info" | "success" | "warning" | "error"
                                         //   | "system" | "reminder" | "announcement"
  title:   String,
  message: String,

  // Optional structured target — lets the UI render a stable click-through
  // without sniffing inside `metadata`.
  link:   String | null,                 // relative path, e.g., "/assessments/abc"
  entity: {                              // null when not entity-scoped
    kind: String,                        // e.g., "assessment_schedule" | "course" | "certification"
    id:   ObjectId
  } | null,

  metadata: Object,                      // free-form context bag (producer-defined)

  dedupe_key: String,                    // producer-supplied idempotency key
                                         //   convention: "{type}:{entity.kind}:{entity.id}"
                                         //   when entity is set; otherwise the producer
                                         //   chooses a stable key (e.g., the source
                                         //   Service Bus messageId).

  read: Boolean,
  read_at: Date | null,
  created_at: Date,
  schema_version: Int
}
```

**Indexes:**
- `{ user_id: 1, read: 1, created_at: -1 }`           ← inbox view
- `{ user_id: 1, dedupe_key: 1 }` (unique)            ← idempotency guard

**Idempotency contract:** the core-service Service Bus consumer MUST set
`dedupe_key` on every notification it inserts. Inserts use
`{ upsert: true }` keyed by `(user_id, dedupe_key)` — a retry of the same
Service Bus message (or a duplicate producer emit) collapses to a single
row. WebSocket re-broadcast on the upsert path is suppressed when no
new document was created.

`type` is intentionally not enumerated — the frontend renders icon/colour
from a small base palette (info / success / warning / error) and falls back
to a default for unknown types.

---

## KnowledgeSource

**Collection:** `knowledge_sources`

Registry of grounding documents indexed by Foundry IQ and/or fetched via the
Microsoft Learn MCP server. Citations on agent outputs (assessment questions,
curator recommendations) resolve back to rows here, giving auditors a single
place to answer "where did this answer come from?".

```js
{
  _id: ObjectId,
  doc_id: String,                        // unique key (file path or external id)
                                         //   e.g., "course-guidance/doc-guidance/DOC-az_204.md"
                                         //         "https://learn.microsoft.com/azure/..."
  source_type: String,                   // enum: "grounding_doc" | "foundry_iq" | "ms_learn_mcp"
  title: String,
  vendor: String | null,                 // "Microsoft" | "AWS" | "Google" | null
  related_certs: [String],               // ["AZ-204", "AZ-400"] — used to filter retrieval
  related_skills: [ObjectId],            // refs → skills._id (optional)
  uri: String,                           // file path or full URL
  content_hash: String,                  // sha256 of content; if changes → re-index
  byte_size: Int,
  indexed_at: Date,                      // last successful index/refresh
  index_version: Int,                    // bumped on each re-index of this doc
  schema_version: Int,
  created_at: Date,
  updated_at: Date
}
```

**Indexes:**
- `{ doc_id: 1 }` (unique)
- `{ source_type: 1, indexed_at: -1 }`
- `{ related_certs: 1 }`               ← multi-key, retrieval filter

**Citation resolution:**
Every citation — regardless of `source_type` — MUST have a `source_id`
that equals a `knowledge_sources.doc_id`. MS Learn MCP results are
**upserted into `knowledge_sources`** the first time they're cited (with
`source_type: "ms_learn_mcp"`, `uri` = the Learn URL, `content_hash` =
sha256 of the fetched markdown). The retrieval layer rejects any citation
that does not resolve. This makes the grounding contract uniform: one
collection answers "where did this answer come from?" no matter which IQ
or MCP surfaced it.

**Re-index trigger:** an out-of-band job rescans `synthetic-data/course-guidance/`,
hashes each file, and updates rows whose `content_hash` differs (bumping
`index_version`). Citations cached in agent insights are revalidated against
the new `index_version` via the existing `inputs_hash` staleness check.

---

## LearningCuratorInsight

**Collection:** `learning_curator_insights`

```js
{
  _id: ObjectId,
  user_id: ObjectId,                     // ref → users._id (unique)
  generated_at: Date,
  expires_at:   Date,                    // hard expiry (TTL index target)
  inputs_hash:  String,                  // sha256 over agent inputs;
                                         //   refresh on hash change
  schema_version: Int,

  recommendations: [{
    course_id: ObjectId,                 // ref → courses._id (deep-link target)
    title:     String,                   // snapshot of course_name
    cert_code: String,                   // snapshot, may be null for non-cert courses
    priority:  String,                   // "Highest" | "High" | "Medium" | "Low"
    reason:    String,
    citations: [{                        // grounded sources backing this recommendation
      source_type: String,
      source_id:   String,
      title:       String,
      url:         String | null,
      snippet:     String | null,
      score:       Number | null
    }]
  }],
  rationale_summary: String              // markdown
}
```

**Indexes:** `{ user_id: 1 }` (unique), `{ expires_at: 1 }` (TTL)

**Staleness:** route layer regenerates when `now > expires_at` OR
recomputed `inputs_hash` differs from stored value.

---

## EngagementAgentInsight

**Collection:** `engagement_agent_insights`

```js
{
  _id: ObjectId,
  user_id: ObjectId,                     // ref → users._id (unique)
  generated_at: Date,
  expires_at:   Date,                    // hard expiry (TTL index target)
  inputs_hash:  String,                  // sha256 over agent inputs
  schema_version: Int,

  engagement_score: Number,              // 0–100
  trend: String,                         // "improving" | "steady" | "declining"
  signals: [{
    name:  String,                       // e.g., "weekly_study_hours"
    value: Number,                       // ALWAYS numeric
    unit:  String,                       // e.g., "hours" | "days" | "count"
    delta: Number | null
  }],
  nudges: [{
    title:   String,
    message: String,
    cta:     String | null
  }]
}
```

**Indexes:** `{ user_id: 1 }` (unique), `{ expires_at: 1 }` (TTL)

**Staleness:** regenerate when `now > expires_at` OR `inputs_hash` mismatch.

---

## AssessmentAgentInsight

**Collection:** `assessment_agent_insights`

```js
{
  _id: ObjectId,
  user_id: ObjectId,                     // ref → users._id (unique)
  generated_at: Date,
  expires_at:   Date,                    // hard expiry (TTL index target)
  inputs_hash:  String,                  // sha256 over agent inputs
  schema_version: Int,

  overall_readiness: String,             // "Ready" | "Almost Ready" | "Borderline" | "Not Ready"
  readiness_score: Number,               // 0–100
  weak_topics: [{
    topic_id: ObjectId,                  // ref → topics._id
    topic_name: String,                  // snapshot
    accuracy: Number,                    // 0–100
    suggested_action: String
  }],
  strong_topic_ids: [ObjectId],          // refs → topics._id
  recommended_next_step: String
}
```

**Indexes:** `{ user_id: 1 }` (unique), `{ expires_at: 1 }` (TTL)

**Staleness:** regenerate when `now > expires_at` OR `inputs_hash` mismatch.

---

## ManagerInsightsAgentInsight

**Collection:** `manager_insights_agent_insights`

```js
{
  _id: ObjectId,
  manager_id: ObjectId,                  // ref → users._id (THE manager) — unique
                                         //   NOTE: this collection uses `manager_id`,
                                         //   NOT `user_id`, to avoid ambiguity.
  generated_at: Date,
  expires_at:   Date,                    // hard expiry (TTL index target)
  inputs_hash:  String,                  // sha256 over agent inputs
  schema_version: Int,

  team_summary: {
    headcount:        Int,
    avg_engagement:   Number,            // 0–100
    on_track_count:   Int,
    at_risk_count:    Int
  },
  reports: [{
    user_id:   ObjectId,                 // ref → users._id (a direct report)
    full_name: String,                   // snapshot
    status:    String,                   // "on_track" | "at_risk" | "behind"
    headline:  String,
    blockers:  [String]
  }],
  recommendations: [String]
}
```

**Indexes:** `{ manager_id: 1 }` (unique), `{ expires_at: 1 }` (TTL)

**Staleness:** regenerate when `now > expires_at` OR `inputs_hash` mismatch.

---

## StudyPlanGeneratorInsight

**Collection:** `study_plan_generator_insights`

```js
{
  _id: ObjectId,
  user_id: ObjectId,                     // ref → users._id (unique)
  generated_at: Date,
  expires_at:   Date,                    // hard expiry (TTL index target)
  inputs_hash:  String,                  // sha256 over agent inputs
  schema_version: Int,

  timezone: String,                      // IANA, e.g., "Asia/Kolkata"
  plan_window: {
    start_date: String,                  // ISO date (YYYY-MM-DD)
    end_date:   String
  },
  weekly_total_minutes: Int,
  days: [{
    day_of_week: String,                 // "Mon" | "Tue" | ... | "Sun"
    blocks: [{
      slot: String,                      // "Morning" | "Afternoon" | "Evening"
      start_local: String,               // "HH:MM" in `timezone`
      duration_minutes: Int,
      topic_id:   ObjectId | null,       // ref → topics._id (null for review/practice)
      topic_name: String,                // snapshot
      activity:   String                 // "read" | "practice" | "review" | "assessment"
    }]
  }],
  notes: String
}
```

**Indexes:** `{ user_id: 1 }` (unique), `{ expires_at: 1 }` (TTL)

**Staleness:** regenerate when `now > expires_at` OR `inputs_hash` mismatch.

`start_local` is wall-clock time interpreted in the document's `timezone`.
The client always renders by converting to the user's current zone.

---

## AgentCache

**Collection:** `agent_cache`

Flat per-(user, agent) cache that backs the dashboard cards. The five
specialist routes — curator, planner, engagement, assessment readiness,
insights — each write here on a successful `*/refresh` call so the
matching `GET` returns instantly without re-invoking Foundry. Owner:
[backend/orchestrator/app/agent_cache.py](backend/orchestrator/app/agent_cache.py).

```js
{
  _id: ObjectId,
  user_id: String,                       // stringified users._id (cache key, not ref)
  agent: String,                         // "curator" | "planner" | "engagement"
                                         //   | "assessment::generate::<cert>"
                                         //   | "assessment::readiness::<cert>"
                                         //   | "insights"
  output: Object | Array | String,       // parsed JSON envelope completion;
                                         //   raw string fallback when the
                                         //   specialist's `completion` did not parse
  trace: Object | null,                  // optional full pipeline journey
                                         //   (initial_envelope, foundry_calls,
                                         //    specialist_turns, final_envelope)
  cached_at: String                      // ISO 8601 UTC, e.g. "2026-06-14T08:23:11.412Z"
}
```

**Indexes:** `{ user_id: 1, agent: 1 }` (unique)

**Eviction:** explicit overwrite on `*/refresh`. No TTL — refresh buttons
in the UI are the documented invalidation surface. The seed script
pre-populates curator / planner / engagement entries for every learner so
the dashboard has content on first login.

---

## TelemetryLog

**Collection:** `telemetry_logs`

Structured per-request log emitted by every backend service
(gateway, core, orchestrator, admin, assessment) and ingested by
admin-service. Powers the admin observability views (RAID viewer, logs
explorer, live log stream). Owner:
[backend/admin-service/app/services/log_handler.py](backend/admin-service/app/services/log_handler.py).

```js
{
  _id: ObjectId,
  service: String,                       // "gateway" | "core-service" | "orchestrator"
                                         //   | "admin-service" | "assessment-service"
  level:   String,                       // "debug" | "info" | "warn" | "error"
  message: String,
  timestamp: Date,                       // service-side wall clock
  raid: String | null,                   // request-scoped correlation id (X-RAID)
  user_id: String | null,                // stringified users._id when known
  status_code:   Int | null,             // for HTTP request lines
  response_time: Number | null,          // milliseconds
  path:   String | null,
  method: String | null,
  ip:     String | null,
  user_agent: String | null,
  meta: Object | null,                   // free-form per-event context bag
  created_at: Date                       // ingestion time (TTL anchor)
}
```

**Indexes:**
- `{ service: 1 }`
- `{ level: 1 }`
- `{ raid: 1 }`
- `{ user_id: 1 }`
- `{ service: 1, level: 1, created_at: -1 }`
- `{ raid: 1, timestamp: 1 }`
- `{ created_at: 1 }` **TTL** — `expireAfterSeconds = 30 * 86400`

**Retention:** documents older than 30 days are auto-removed by the TTL
index. There is no archival path — observability is operational, not
audit-grade.

---

## Atomicity & Reconciliation Notes

The submit-exam path crosses several collections; treat each step as
**idempotent** and wrap the high-value writes in a MongoDB transaction:

```
submit_schedule(schedule_id) [tx]:
  1. assessment_questions  : write selected_index per question
  2. assessment_results    : insert (uniqued on schedule_id → idempotent)
  3. assessment_schedules  : status="completed", mirror score_percentage/passed
  4. certifications        : if passed and no current cert for (user,course),
                             insert + flip previous is_current=false
  5. course_progress       : ($addToSet completed_topics for topics ≥80% on this attempt? optional)
[/tx]
  6. notifications: emit (separate; outside tx; idempotent via
                   upsert on (user_id, dedupe_key))
```

Out-of-band reconciliation jobs:
- **Course version sweeper** — when `courses.course_version` increments, walk
  matching `course_progress` rows and prune dead `topic_id`s; recompute
  derived fields.
- **Stuck schedule sweeper** — `status ∈ {pending, generating}` AND
  `scheduled_at < now() - 30m` → set `status="failed"`, emit notification.
- **Insight cache cleaner** — TTL index on `expires_at` removes expired docs;
  next read triggers regeneration.

---

## Relationship Diagram

> The `job_levels ↔ job_roles ↔ skills ↔ courses ↔ modules ↔ topics` graph
> is the **ontology** the agents reason over — the natural target for a
> Fabric IQ semantic layer. Treat each edge below as a typed relationship
> a downstream Fabric IQ model can adopt verbatim.

```
┌────────────┐      ┌────────────┐      ┌──────────┐
│ job_levels │◄─────│  job_roles │─────►│  skills  │
└────────────┘ level└─────┬──────┘ req_ └────┬─────┘
                          │ req_courses      │
                          ▼                  │
                    ┌──────────┐             │
                    │  courses │◄────────────┘ certification.skills
                    └────┬─────┘
                         │ modules[] : [ObjectId]
                         ▼
                    ┌──────────┐
                    │ modules  │
                    └────┬─────┘
                         │ topics[] : [ObjectId]
                         ▼
                    ┌──────────┐
                    │  topics  │
                    └──────────┘

  course_progress (user_id, course_id) ── completed_topics[] → topics

  assessment_schedules ─┬─► assessment_questions  (1:1, schedule_id)
                        └─► assessment_results    (1:1, schedule_id)
                                  │
                                  ▼ assessment_result_id
                           certifications  (recertifications: is_current flag)

  History view = assessment_schedules  (score/passed mirrored on submit)

  users  ──► user_credentials   (1:1, auth secrets off the hot path)
         ──► work_signals       (1:1, Work IQ signals + learning prefs)
         ──► chat_conversations ──► chat_messages
         ──► notifications
         ──► learning_curator_insights
         ──► engagement_agent_insights
         ──► assessment_agent_insights
         ──► study_plan_generator_insights
  managers ─► manager_insights_agent_insights  (keyed by manager_id)

  knowledge_sources  ◄──── citations[] on assessment_questions.questions[]
                     ◄──── citations[] on learning_curator_insights.recommendations[]
```

---

## Out of Scope

Explicitly **not** modelled in this schema. Each is a deliberate omission
for the hackathon scope; the call-out exists so reviewers don't read the
absence as an oversight.

| Concern | Why deferred | What would change |
|---|---|---|
| **Multi-tenancy** | Single-tenant demo deployment. | Add `org_id: ObjectId` to every collection + compound indexes `(org_id, ...)`. |
| **Matrix / dotted-line reporting** | `users.reports_to` is single-valued. | Either widen to `[ObjectId]` or introduce an `org_relationships` collection (`{ user_id, manager_id, kind: "solid" \| "dotted" }`). |
| **Audit log** | `created_by` / `updated_by` give "last touched" but not history. | New `audit_events` collection: `{ actor_id, entity: {kind, id}, action, before, after, at }`. |
| **Per-question response times** | `assessment_results` stores aggregate `time_spent_minutes` only. | Add `assessment_questions.questions[].time_spent_seconds` written on submit. |
| **Notification metadata bounds** | `notifications.metadata` is `Object` with no cap. | App-side validator: ≤4 KB, no nested arrays beyond depth 2. |
| **Question types beyond MCQ** | `kind` discriminator is in place, only `"mcq"` is implemented. | Future kinds (`multi_select`, `short_answer`, `code`) reuse the same envelope. No schema migration needed. |
| **Work IQ freshness threshold** | `work_signals.signals_refreshed_at` is recorded but not gated. | Convention: consumers treat `now - signals_refreshed_at > 7d` as stale and degrade gracefully. |
| **Assessment archival** | `assessment_questions_archive` collection mentioned but not specified here. | Out-of-band maintenance job; not a runtime contract. |
