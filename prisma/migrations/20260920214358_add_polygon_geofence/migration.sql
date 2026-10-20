-- AlterTable
ALTER TABLE "hotels" ADD COLUMN     "attendanceGeofencePoints" JSONB,
ADD COLUMN     "attendanceGeofenceType" TEXT NOT NULL DEFAULT 'CIRCLE';
