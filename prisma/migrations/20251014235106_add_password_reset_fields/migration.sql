/*
  Warnings:

  - A unique constraint covering the columns `[resetPasswordToken]` on the table `clients` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "resetPasswordExpires" TIMESTAMP(3),
ADD COLUMN     "resetPasswordToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clients_resetPasswordToken_key" ON "clients"("resetPasswordToken");
