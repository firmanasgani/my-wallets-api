-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetPasswordOtp" TEXT,
ADD COLUMN     "resetPasswordOtpExpires" TIMESTAMP(3),
ADD COLUMN     "resetPasswordToken" TEXT,
ADD COLUMN     "resetPasswordTokenExpires" TIMESTAMP(3);
