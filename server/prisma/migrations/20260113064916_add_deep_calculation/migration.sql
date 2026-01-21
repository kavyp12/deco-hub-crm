-- CreateTable
CREATE TABLE "DeepCalculation" (
    "id" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeepCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeepCalculationItem" (
    "id" TEXT NOT NULL,
    "deepCalculationId" TEXT NOT NULL,
    "selectionItemId" TEXT NOT NULL,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'mm',
    "panna" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "channel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fabric" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blackout" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sheer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fitting" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weightChain" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fabricRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blackoutRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sheerRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "channelRate" DOUBLE PRECISION NOT NULL DEFAULT 285,
    "labourRate" DOUBLE PRECISION NOT NULL DEFAULT 450,
    "fittingRate" DOUBLE PRECISION NOT NULL DEFAULT 355,
    "hasBlackout" BOOLEAN NOT NULL DEFAULT false,
    "hasSheer" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeepCalculationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeepCalculation_selectionId_key" ON "DeepCalculation"("selectionId");

-- AddForeignKey
ALTER TABLE "DeepCalculation" ADD CONSTRAINT "DeepCalculation_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeepCalculationItem" ADD CONSTRAINT "DeepCalculationItem_deepCalculationId_fkey" FOREIGN KEY ("deepCalculationId") REFERENCES "DeepCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeepCalculationItem" ADD CONSTRAINT "DeepCalculationItem_selectionItemId_fkey" FOREIGN KEY ("selectionItemId") REFERENCES "SelectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
