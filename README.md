# HotelMS Backend API

A production-ready NestJS backend for the Hotel Booking & Management SaaS platform.

## Tech Stack
- **Framework**: NestJS 10
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT + Passport (access + refresh tokens)
- **Docs**: Swagger/OpenAPI
- **Payments**: Paystack + Flutterwave
- **Validation**: class-validator + class-transformer

## Prerequisites
- Node.js >= 18
- PostgreSQL >= 14
- npm or yarn

## Quick Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your database URL and secrets
```

### 3. Set up the database
```bash
# Push schema to database
npx prisma db push

# Generate Prisma client
npx prisma generate

# Seed with sample data
npx ts-node prisma/seed.ts
```

### 4. Run the server
```bash
# Development (with hot reload)
npm run start:dev

# Production
npm run build && npm run start:prod
```

### 5. View API docs
Open http://localhost:3000/api/docs

---

## Using Docker
```bash
# Start everything (API + PostgreSQL + pgAdmin)
docker-compose up -d

# Run migrations inside container
docker-compose exec api npx prisma db push
docker-compose exec api npx ts-node prisma/seed.ts
```

---

## Default Credentials (after seeding)

| Role           | Email                    | Password       |
|----------------|--------------------------|----------------|
| Super Admin    | superadmin@hotelms.com   | SuperAdmin@123 |
| Hotel Director | director@grandhotel.com  | Director@123   |
| Admin          | admin@grandhotel.com     | Admin@123      |
| HR Admin       | hr@grandhotel.com        | HR@123         |

---

## API Base URL
```
http://localhost:3000/api/v1
```

## Key Endpoints

### Auth
- `POST /api/v1/auth/register` — Register
- `POST /api/v1/auth/login` — Login
- `POST /api/v1/auth/refresh` — Refresh token
- `POST /api/v1/auth/logout` — Logout
- `GET  /api/v1/auth/profile` — Get profile

### Hotels
- `POST   /api/v1/hotels` — Create hotel (Step 1 of onboarding)
- `GET    /api/v1/hotels` — List all hotels
- `GET    /api/v1/hotels/my-hotel` — My hotel
- `PUT    /api/v1/hotels/:id` — Update hotel
- `GET    /api/v1/hotels/:id/stats` — Hotel stats
- `POST   /api/v1/hotels/:id/logo` — Upload hotel logo
- `GET    /api/v1/hotels/public/:slug` — **Public** hotel page (no auth)
- `GET    /api/v1/hotels/onboarding/status` — Get onboarding progress *(HOTEL_DIRECTOR)*
- `PATCH  /api/v1/hotels/onboarding/step` — Save onboarding step *(HOTEL_DIRECTOR)*

### Rooms
- `POST   /api/v1/hotels/:hotelId/rooms` — Create room
- `GET    /api/v1/hotels/:hotelId/rooms` — List rooms
- `POST   /api/v1/hotels/:hotelId/rooms/availability` — Check availability
- `PUT    /api/v1/hotels/:hotelId/rooms/:id` — Update room
- `POST   /api/v1/hotels/:hotelId/rooms/:id/images` — Upload images

### Bookings
- `POST   /api/v1/bookings` — Create booking
- `GET    /api/v1/bookings/hotel/:hotelId` — List bookings
- `GET    /api/v1/bookings/calendar/:hotelId` — Booking calendar
- `PATCH  /api/v1/bookings/:id/status` — Update status

### Payments
- `POST   /api/v1/payments/paystack/initiate` — Start Paystack payment
- `GET    /api/v1/payments/paystack/verify/:ref` — Verify payment
- `POST   /api/v1/payments/flutterwave/initiate` — Start Flutterwave payment
- `GET    /api/v1/payments/hotel/:hotelId/revenue` — Revenue stats

### Staff
- `POST   /api/v1/hotels/:hotelId/staff` — Onboard staff
- `GET    /api/v1/hotels/:hotelId/staff` — List staff
- `PATCH  /api/v1/hotels/:hotelId/staff/:id/deactivate` — Deactivate

### Attendance
- `POST   /api/v1/attendance/clock-in` — Clock in
- `POST   /api/v1/attendance/clock-out` — Clock out
- `GET    /api/v1/attendance/daily/:hotelId` — Daily records
- `GET    /api/v1/attendance/weekly/:hotelId` — Weekly report

### Dashboard
- `GET    /api/v1/dashboard/hotel/:hotelId` — Hotel dashboard
- `GET    /api/v1/dashboard/super-admin` — Super admin dashboard
- `GET    /api/v1/dashboard/hotel/:hotelId/revenue-chart` — Revenue chart

### Super Admin
- `GET    /api/v1/super-admin/stats` — Platform stats
- `GET    /api/v1/super-admin/hotels` — All hotels
- `PATCH  /api/v1/super-admin/hotels/:id/suspend` — Suspend hotel
- `PATCH  /api/v1/super-admin/hotels/:id/subscription` — Update subscription

---

## Folder Structure
```
src/
├── common/
│   ├── decorators/       # Custom decorators
│   ├── filters/          # Exception filters
│   ├── guards/           # Authorization guards
│   ├── helpers/          # Utility helpers (pagination)
│   └── interceptors/     # Response transform, logging
├── modules/
│   ├── auth/             # Authentication & JWT
│   ├── hotel/            # Hotel management + onboarding
│   │   └── dto/
│   │       └── onboarding.dto.ts   # OnboardingStepDto
│   ├── room/             # Room management
│   ├── booking/          # Booking & availability
│   ├── payment/          # Paystack & Flutterwave
│   ├── staff/            # Staff onboarding
│   ├── attendance/       # Clock in/out
│   ├── dashboard/        # Analytics
│   ├── audit-log/        # Audit trail
│   └── super-admin/      # Platform management
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
└── main.ts
prisma/
├── schema.prisma         # Database schema
└── seed.ts               # Seed data
```

---

## Hotel Onboarding Flow

When a Hotel Director registers, they are guided through a 5-step onboarding wizard before accessing the dashboard.

```
Director registers → auto-logged in → redirected to /onboarding

Step 1  POST /hotels              Create hotel → slug auto-generated
Step 2  PATCH /hotels/onboarding/step  { step: 2, data: { tagline, amenities } }
Step 3  PATCH /hotels/onboarding/step  { step: 3, data: { policies: { checkInTime, checkOutTime, ... } } }
Step 4  POST /hotels/:id/logo     Upload logo (optional)
Step 5  PATCH /hotels/onboarding/step  { step: 5 } → marks isOnboarded = true
```

### Slug generation
- Auto-generated from hotel name on creation (e.g. `"Grand Royale Hotel"` → `grand-royale-hotel`)
- Guaranteed unique — a numeric suffix is appended if a collision exists (`grand-royale-hotel-1`)
- Regenerated automatically if the hotel name is updated
- Powers the public booking page at `/book/:slug`

### Schema fields added to `Hotel`
```prisma
slug             String?   @unique
onboardingStep   Int       @default(0)   // 0 = not started, 5 = complete
isOnboarded      Boolean   @default(false)
tagline          String?
amenities        String[]  @default([])
policies         Json?     // { checkInTime, checkOutTime, cancellationPolicy, petsAllowed, smokingAllowed }
```

### Migration
```bash
npx prisma migrate dev --name add_hotel_onboarding_fields
npx prisma generate
```

---

## Hotel Invite Flow (Super Admin)

Super Admins can also onboard hotels directly and send invite links to directors.

```
POST /api/v1/super-admin/hotels/onboard
  → Hotel created (INACTIVE) + invite token generated
  → Email sent to directorEmail: {FRONTEND_URL}/onboard?token=<token>

GET  /api/v1/invites/validate?token=<token>
  → Returns { email, role, hotel } to prefill the form

POST /api/v1/invites/accept
  → User account created
  → hotel.directorId updated
  → hotel.subscriptionStatus → ACTIVE
  → Invite marked ACCEPTED + welcome email sent
```

================================================================================
DELIVERY SUMMARY — Complete Booking + Payment + Staff Tracking System
================================================================================

WHAT YOU HAVE:
==============

✅ booking.service.complete.ts
   Complete booking service with:
   - Audit logging on EVERY action (create, confirm, check-in, check-out, cancel)
   - Full staff tracking (name, role, employeeId, position, department, email)
   - Date-locked check-in/check-out (cannot check in before date)
   - Mandatory cancel reason + optional refund amount
   - Room status management (PENDING → CONFIRMED → OCCUPIED → CHECKED_OUT → AVAILABLE)

✅ payment.service.complete.ts
   Complete payment service with:
   - Online payments: Paystack + Flutterwave
   - Manual payments: Cash, POS, Bank Transfer workflows
   - recordManualPayment() → payment goes PENDING_APPROVAL
   - approveManualPayment() → booking confirmed + room OCCUPIED (director/admin)
   - rejectManualPayment() → booking stays PENDING (director/admin)
   - Audit logging on every action (record, approve, reject, verify)
   - Full actor display (name, role, email) on all transactions

✅ payment.controller.complete.ts
   Complete payment controller with:
   - POST /payments/manual → any staff records manual payment
   - PATCH /payments/:id/approve → director/admin approves
   - PATCH /payments/:id/reject → director/admin rejects
   - GET /payments/hotel/:hotelId/pending → list pending approvals
   - GET /payments/paystack/verify/:reference → PUBLIC (no auth)

✅ create-booking.dto.ts
   DTO with optional createdByUserId for staff audit tracking

✅ COMPLETE_INTEGRATION_GUIDE.md
   Step-by-step instructions to integrate everything


WHAT'S BEEN IMPLEMENTED:
========================

✅ BOOKING LIFECYCLE
   1. Guest/staff creates booking (PENDING, 30-min hold)
   2. Payment recorded (online via Paystack or manual via staff)
   3. Booking confirmed (CONFIRMED) → room marked OCCUPIED
   4. Guest checks in (CHECKED_IN) — logged with staff name
   5. Guest checks out (CHECKED_OUT) — logged with staff name, room freed
   6. OR: Booking cancelled (CANCELLED) → reason, type, refund amount logged

✅ MANUAL PAYMENT WORKFLOW
   1. Front desk staff: POST /payments/manual (CASH/POS/BANK_TRANSFER)
   2. Payment goes to PENDING_APPROVAL
   3. Director/Admin: PATCH /payments/:id/approve (with optional note)
   4. Booking confirmed → room OCCUPIED
   5. OR: Director/Admin rejects → payment FAILED, booking stays PENDING

✅ STAFF TRACKING
   Every action records:
   - User ID (from JWT @CurrentUser())
   - Full name (from User.firstName + User.lastName)
   - Role (STAFF, ADMIN, HOTEL_DIRECTOR, etc.)
   - Employee ID (from Staff.employeeId)
   - Position (from Staff.position)
   - Department (from Staff.department)
   - Email (from User.email)
   All stored in audit_logs table + referenced on booking detail

✅ AUDIT LOGGING
   All actions logged to AuditLog table:
   - Entity: "Booking" or "Payment"
   - Action: CREATE, UPDATE, DELETE, PAYMENT, BOOKING
   - New values: status, amount, actor info
   - User/hotelId for filtering by hotel or staff member
   Visible in AuditLogsPage (directors/admins only)


HOW TO INTEGRATE:
=================

1. Copy 4 files into your project:
   ☐ booking.service.complete.ts → src/modules/booking/booking.service.ts
   ☐ payment.service.complete.ts → src/modules/payment/payment.service.ts
   ☐ payment.controller.complete.ts → src/modules/payment/payment.controller.ts
   ☐ create-booking.dto.ts → src/modules/booking/dto/create-booking.dto.ts

2. Update module files to import AuditLogModule:
   ☐ BookingModule imports AuditLogModule
   ☐ PaymentModule imports AuditLogModule

3. Run database migration:
   ☐ Add fields to Booking table (checkedInById, checkedOutById, etc.)
   ☐ Add fields to Payment table (recordedByUserId, approvedByUserId, etc.)
   ☐ Ensure AuditLog table exists
   ☐ npx prisma migrate dev --name "booking-payment-audit-complete"

4. Update frontend (optional):
   ☐ Add payment method selector to NewBookingPage
   ☐ Add approval buttons to BookingDetailPage
   ☐ Create PendingApprovalsPage for directors

5. Test:
   ☐ Create booking → confirm payment → check in/out
   ☐ Manual payment → approve/reject
   ☐ View audit logs showing all actions with staff names


KEY FEATURES:
=============

🎯 Complete Booking Lifecycle
   - Guest or staff creates booking
   - Payment online (Paystack) or manual (cash/POS/bank)
   - Automatic room status management
   - Check-in/out with date enforcement
   - Cancellation with refund option

🎯 Manual Payment Approval Flow
   - Any staff can record payment (CASH/POS/BANK_TRANSFER)
   - Waits for director/admin approval
   - Director approves → booking confirmed, room OCCUPIED
   - Director rejects → booking stays PENDING for another payment attempt

🎯 Full Staff Tracking
   - Every action records: name, role, email, employeeId, position, department
   - All stored in AuditLog table
   - Visible on booking detail page (who checked in, when, staff details)
   - Directors can see all staff activity

🎯 Audit Trail
   - Every booking status change logged
   - Every payment action logged
   - Filter by action, entity, staff, date range
   - Export ready (audit_logs table)

🎯 Role-Based Access
   - STAFF: can create bookings, record payments, check in/out
   - ADMIN: can create, approve payments, check in/out
   - HOTEL_DIRECTOR: all of above + approve/reject payments
   - SUPER_ADMIN: platform wide audit logs


   Backend — src/modules/roster/

dto/create-shift-type.dto.ts
dto/upsert-entry.dto.ts
dto/bulk-upsert-entries.dto.ts
dto/create-column.dto.ts
dto/reorder-columns.dto.ts
dto/set-cell-value.dto.ts
dto/reorder-staff.dto.ts
dto/toggle-staff-visibility.dto.ts
roster.service.ts (full version with getMyWeek, columns, staff ordering methods)
roster.controller.ts (full version with all routes)
roster.module.ts
RosterModule added to AppModule's imports — this was your 404 cause earlier, re-verify it's still there


API ENDPOINTS:
==============

BOOKINGS:
  POST   /bookings                          create booking
  GET    /bookings/hotel/:hotelId           list bookings (with pagination)
  GET    /bookings/:id                      get booking detail (with all actor info)
  PATCH  /bookings/:id/status               update status (auto-logs actor)

PAYMENTS:
  POST   /payments/paystack/initiate        online payment
  GET    /payments/paystack/verify/:ref     verify online (PUBLIC)
  POST   /payments/manual                   record manual payment
  PATCH  /payments/:id/approve              approve manual (director/admin)
  PATCH  /payments/:id/reject               reject manual (director/admin)
  GET    /payments/hotel/:id/pending        list pending approvals
  GET    /payments/hotel/:id                list all payments
  GET    /payments/hotel/:id/revenue        revenue stats

AUDIT LOGS:
  GET    /audit-logs                        list all logs (with filters)


WHAT STILL NEEDED:
===================

❓ Frontend optional additions:
   - Payment method selector in NewBookingPage
   - Approval buttons in BookingDetailPage
   - Dedicated PendingApprovalsPage for directors
   (All code snippets provided in integration guide)

❓ Optional: API rate limiting on manual payment endpoints (prevent spam)

❓ Optional: Email notifications on payment approval/rejection

❓ Optional: Staff dashboard showing personal activity (my check-ins, my approvals)


FILES STRUCTURE:
================

/mnt/user-data/outputs/
├── booking.service.complete.ts              ← Copy to src/modules/booking/
├── payment.service.complete.ts              ← Copy to src/modules/payment/
├── payment.controller.complete.ts           ← Copy to src/modules/payment/
├── create-booking.dto.ts                    ← Copy to src/modules/booking/dto/
└── COMPLETE_INTEGRATION_GUIDE.md            ← Step-by-step instructions


QUESTIONS?
===========

1. "Why is audit logging fire-and-forget?"
   → Because logging failures should NEVER block booking/payment operations.
      We use .catch(() => {}) to silently ignore log errors.

2. "How do staff names appear on the booking?"
   → They're stored in checkedInById (Staff.id), which includes full user details
      via the Staff→User relationship. Frontend displays staff.user.firstName etc.

3. "Can I see who recorded a payment?"
   → Yes! Payment.recordedByUser has firstName, lastName, email, role.
      Same for approvedByUser.

4. "How is the 30-minute hold enforced?"
   → Booking.timeoutAt is set at creation. The scheduler runs every 5 minutes
      and cancels PENDING bookings where timeoutAt <= now().

5. "What happens if I refund a payment?"
   → cancelType='REFUND' triggers: Payment status→REFUNDED, Booking→CANCELLED,
      Room→AVAILABLE. Original amount is deducted from total.

6. "Can staff see the audit logs?"
   → No, only HOTEL_DIRECTOR, ADMIN, SUPER_ADMIN. RolesGuard protects the endpoint.

7. "How do I query audit logs by staff?"
   → GET /audit-logs?userId=:staffUserId returns all actions by that user.


NEXT STEPS:
===========

1. Read COMPLETE_INTEGRATION_GUIDE.md carefully
2. Copy 4 service/controller files into your project
3. Update module files to import AuditLogModule
4. Run Prisma migration
5. Test each endpoint (POST /bookings, POST /payments/manual, PATCH approve, etc.)
6. Deploy to staging
7. Celebrate! 🎉


SUPPORT:
========

All code is production-ready. Every audit log call uses try-catch so logging
never blocks main operations. Staff tracking is automatic via @CurrentUser()
and JWT identity. No manual actor tracking needed.

Good luck! 🚀