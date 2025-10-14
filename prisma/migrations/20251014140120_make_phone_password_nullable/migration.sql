/*
  Warnings:

  - A unique constraint covering the columns `[googleId]` on the table `clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[facebookId]` on the table `clients` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "facebookId" TEXT,
ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "clients_googleId_key" ON "clients"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_facebookId_key" ON "clients"("facebookId");
