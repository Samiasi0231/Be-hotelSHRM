/*
  Warnings:

  - You are about to drop the column `department` on the `invites` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `invites` table. All the data in the column will be lost.
  - You are about to drop the column `hotelId` on the `invites` table. All the data in the column will be lost.
  - You are about to drop the column `position` on the `invites` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `invites` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `invites` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `invites` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- DropForeignKey
ALTER TABLE "invites" DROP CONSTRAINT "invites_hotelId_fkey";

-- DropIndex
DROP INDEX "invites_email_idx";

-- AlterTable
ALTER TABLE "invites" DROP COLUMN "department",
DROP COLUMN "email",
DROP COLUMN "hotelId",
DROP COLUMN "position",
DROP COLUMN "role",
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "gender" "Gender";

-- CreateIndex
CREATE UNIQUE INDEX "invites_userId_key" ON "invites"("userId");

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
