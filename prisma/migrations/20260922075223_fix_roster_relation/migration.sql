-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "hiddenFromRoster" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rosterOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "roster_columns" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_cell_values" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "value" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_cell_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roster_cell_values_rosterId_staffId_columnId_key" ON "roster_cell_values"("rosterId", "staffId", "columnId");

-- AddForeignKey
ALTER TABLE "roster_columns" ADD CONSTRAINT "roster_columns_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_cell_values" ADD CONSTRAINT "roster_cell_values_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_cell_values" ADD CONSTRAINT "roster_cell_values_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_cell_values" ADD CONSTRAINT "roster_cell_values_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "roster_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
