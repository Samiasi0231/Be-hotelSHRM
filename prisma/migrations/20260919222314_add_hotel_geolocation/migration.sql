-- AlterTable
ALTER TABLE "hotels" ADD COLUMN     "attendanceRadiusM" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7);
