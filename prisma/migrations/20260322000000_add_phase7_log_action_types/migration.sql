-- Phase 7: Audit Log extension - add business invoice overdue and report export log action types

ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_INVOICE_OVERDUE';
ALTER TYPE "LogActionType" ADD VALUE 'BUSINESS_REPORT_EXPORT';
