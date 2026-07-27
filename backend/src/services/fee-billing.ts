import type { Prisma, PrismaClient } from '@prisma/client';
import { getDb } from '../config/db.js';

type Db = PrismaClient | Prisma.TransactionClient;

export const schoolDate = (date = new Date()) => new Date(new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.SCHOOL_TIMEZONE ?? 'Asia/Kolkata',
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date) + 'T00:00:00.000Z');

export const academicYearFor = (date = schoolDate()) => {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 3 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
};

const periodFor = (frequency: string, date: Date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (frequency === 'MONTHLY') return `${year}-${String(month).padStart(2, '0')}`;
  if (frequency === 'QUARTERLY') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return academicYearFor(date);
};

const shouldBillNow = (frequency: string, date: Date, onAdmission: boolean) => {
  if (onAdmission) return true;
  const month = date.getUTCMonth() + 1;
  if (frequency === 'MONTHLY') return true;
  if (frequency === 'QUARTERLY') return [4, 7, 10, 1].includes(month);
  if (frequency === 'ANNUAL') return month === 4;
  return false;
};

async function availableAdvance(tx: Db, studentId: string) {
  const entries = await tx.studentLedger.findMany({
    where: { studentId, referenceType: { in: ['ADVANCE_CREDIT', 'ADVANCE_ALLOCATION', 'ADVANCE_REFUND'] } },
    select: { amount: true },
  });
  return Math.max(0, entries.reduce((sum, entry) => sum + Number(entry.amount), 0));
}

async function applyAdvance(tx: Db, fee: { id: string; studentId: string; amount: Prisma.Decimal; paidAmount: Prisma.Decimal; title: string }, date: Date) {
  const credit = await availableAdvance(tx, fee.studentId);
  const outstanding = Math.max(0, Number(fee.amount) - Number(fee.paidAmount));
  const applied = Math.min(credit, outstanding);
  if (applied <= 0) return 0;
  const receiptNo = `ADJ-${date.getUTCFullYear()}-${Date.now().toString().slice(-8)}-${fee.id.slice(-4)}`;
  const payment = await tx.feePayment.create({ data: { feeId: fee.id, receiptNo, amount: applied, method: 'ADVANCE_CREDIT', paidAt: date } });
  await tx.studentLedger.create({ data: {
    studentId: fee.studentId, type: 'ADJUSTMENT', amount: -applied,
    description: `Advance adjusted against ${fee.title}`, referenceType: 'ADVANCE_ALLOCATION', referenceId: payment.id, occurredAt: date,
  } });
  await tx.studentLedger.create({ data: {
    studentId: fee.studentId, type: 'PAYMENT', amount: applied,
    description: `Advance payment applied to ${fee.title}`, referenceType: 'FeePayment', referenceId: payment.id, occurredAt: date,
  } });
  const totalPaid = Number(fee.paidAmount) + applied;
  await tx.fee.update({ where: { id: fee.id }, data: { paidAmount: totalPaid, status: totalPaid >= Number(fee.amount) ? 'PAID' : 'PARTIAL', paidAt: totalPaid >= Number(fee.amount) ? date : null } });
  return applied;
}

export async function billStudentForClass(tx: Db, studentId: string, className: string, options: { date?: Date; onAdmission?: boolean } = {}) {
  const date = schoolDate(options.date);
  const academicYear = academicYearFor(date);
  const structures = await tx.feeStructure.findMany({
    where: { isActive: true, academicYear, OR: [{ className }, { className: null }] },
    orderBy: { name: 'asc' },
  });
  const created = [];
  for (const structure of structures) {
    if (options.onAdmission && !structure.chargeOnAdmission) continue;
    if (!shouldBillNow(structure.frequency, date, Boolean(options.onAdmission))) continue;
    const billingPeriod = periodFor(structure.frequency, date);
    const dueDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), Math.min(28, Math.max(1, structure.dueDay))));
    const invoiceNo = `INV-${billingPeriod.replace(/[^0-9A-Z]/gi, '')}-${studentId.slice(-4).toUpperCase()}-${structure.id.slice(-4).toUpperCase()}`;
    let fee = await tx.fee.findUnique({ where: { studentId_feeStructureId_billingPeriod: { studentId, feeStructureId: structure.id, billingPeriod } } });
    if (!fee) {
      const legacy = await tx.fee.findFirst({
        where: {
          studentId, feeStructureId: null, amount: structure.amount,
          title: { startsWith: structure.name, mode: 'insensitive' },
          dueDate: { gte: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)), lt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)) },
        },
        orderBy: { createdAt: 'asc' },
      });
      fee = legacy
        ? await tx.fee.update({ where: { id: legacy.id }, data: { feeStructureId: structure.id, billingPeriod } })
        : await tx.fee.create({ data: { studentId, feeStructureId: structure.id, billingPeriod, invoiceNo, title: `${structure.name} · ${billingPeriod}`, amount: structure.amount, dueDate, status: 'PENDING' } });
    }
    const hasCharge = await tx.studentLedger.findFirst({ where: { studentId, referenceType: 'Fee', referenceId: fee.id }, select: { id: true } });
    if (!hasCharge) await tx.studentLedger.create({ data: { studentId, type: 'CHARGE', amount: structure.amount, description: fee.title, referenceType: 'Fee', referenceId: fee.id, occurredAt: date } });
    await applyAdvance(tx, fee, date);
    created.push(fee);
  }
  return created;
}

export async function runMonthlyBilling(date = new Date()) {
  const db = getDb();
  const schoolToday = schoolDate(date);
  const students = await db.student.findMany({ where: { classId: { not: null } }, select: { id: true, class: { select: { name: true } } } });
  let invoices = 0;
  for (const student of students) {
    if (!student.class) continue;
    const created = await db.$transaction(tx => billStudentForClass(tx, student.id, student.class!.name, { date: schoolToday }), { timeout: 30_000 });
    invoices += created.length;
  }
  return { students: students.length, invoices, billingDate: schoolToday.toISOString(), academicYear: academicYearFor(schoolToday) };
}
