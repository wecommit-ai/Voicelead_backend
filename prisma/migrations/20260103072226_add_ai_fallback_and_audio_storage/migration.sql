/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `Lead` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "imageUrl",
ADD COLUMN     "captureMode" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "ocrText" TEXT,
ADD COLUMN     "rawAudioUrl" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "type" TEXT,
ALTER COLUMN "source" DROP NOT NULL,
ALTER COLUMN "source" DROP DEFAULT;
