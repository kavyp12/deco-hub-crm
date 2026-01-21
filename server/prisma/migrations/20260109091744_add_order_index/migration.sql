/*
  Warnings:

  - You are about to drop the `DeepCalculation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeepCalculationItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DeepCalculation" DROP CONSTRAINT "DeepCalculation_selectionId_fkey";

-- DropForeignKey
ALTER TABLE "DeepCalculationItem" DROP CONSTRAINT "DeepCalculationItem_calculationId_fkey";

-- DropForeignKey
ALTER TABLE "DeepCalculationItem" DROP CONSTRAINT "DeepCalculationItem_selectionItemId_fkey";

-- AlterTable
ALTER TABLE "LocalCalculationItem" ALTER COLUMN "channelRate" SET DEFAULT 0,
ALTER COLUMN "labourRate" SET DEFAULT 0,
ALTER COLUMN "fittingRate" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "SelectionItem" ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "DeepCalculation";

-- DropTable
DROP TABLE "DeepCalculationItem";
