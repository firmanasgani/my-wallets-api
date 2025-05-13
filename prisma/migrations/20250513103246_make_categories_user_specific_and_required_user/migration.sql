/*
  Warnings:

  - A unique constraint covering the columns `[userId,categoryName,categoryType,parentCategoryId]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - Made the column `userId` on table `Category` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `Category` DROP FOREIGN KEY `Category_userId_fkey`;

-- DropIndex
DROP INDEX `Category_userId_fkey` ON `Category`;

-- AlterTable
ALTER TABLE `Category` MODIFY `userId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Category_userId_categoryName_categoryType_parentCategoryId_key` ON `Category`(`userId`, `categoryName`, `categoryType`, `parentCategoryId`);

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
