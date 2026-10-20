-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "checkedInById" TEXT,
ADD COLUMN     "checkedOutById" TEXT;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
