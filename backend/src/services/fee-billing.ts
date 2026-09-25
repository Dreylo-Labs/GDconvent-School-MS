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
  if (frequency === 'SEMESTERLY') return `${academicYearFor(date)}-S${month >= 4 && month <= 9 ? 1 : 2}`;
  return academicYearFor(date);
};

const shouldBillNow = (frequency: string, date: Date, onAdmission: boolean) => {
  if (onAdmission) return true;
  const month = date.getUTCMonth() + 1;
  if (frequency === 'MONTHLY') return true;
  if (frequency === 'QUARTERLY') return [4, 7, 10, 1].includes(month);
  if (frequency === 'ANNUAL') return month === 4;
  if (frequency === 'SEMESTERLY') return [4, 10].includes(month);
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
  const concessions = await tx.feeConcession.aggregate({ where: { feeId: fee.id }, _sum: { amount: true } });
  const netAmount = Math.max(0, Number(fee.amount) - Number(concessions._sum.amount ?? 0));
  const outstanding = Math.max(0, netAmount - Number(fee.paidAmount));
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
  await tx.fee.update({ where: { id: fee.id }, data: { paidAmount: totalPaid, status: totalPaid >= netAmount ? 'PAID' : 'PARTIAL', paidAt: totalPaid >= netAmount ? date : null } });
  return applied;
}

export async function billStudentForClass(tx: Db, studentId: string, className: string, options: { date?: Date; onAdmission?: boolean } = {}) {
  const date = schoolDate(options.date);
  const academicYear = academicYearFor(date);
  const student = await tx.student.findUnique({ where: { id: studentId }, select: { feeExempt: true, feeExemptFrom: true, feeExemptTo: true, familyMemberships: { where: { familyFeePlan: { isActive: true, startsAt: { lte: date }, OR: [{ endsAt: null }, { endsAt: { gte: date } }] } }, take: 1, select: { familyFeePlanId: true } }, scholarships: { where: { isActive: true, startsAt: { lte: date }, OR: [{ endsAt: null }, { endsAt: { gte: date } }] } } } });
  const exemptNow = student?.feeExempt && (!student.feeExemptFrom || student.feeExemptFrom <= date) && (!student.feeExemptTo || student.feeExemptTo >= date);
  if (exemptNow || student?.familyMemberships.length) return [];
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
    let remaining = Number(fee.amount);
    for (const scholarship of student?.scholarships ?? []) {
      const calculated = scholarship.kind === 'PERCENTAGE' ? Number(fee.amount) * Number(scholarship.value) / 100 : Number(scholarship.value);
      const amount = Math.max(0, Math.min(remaining, calculated));
      if (amount <= 0) continue;
      await tx.feeConcession.upsert({ where: { feeId_scholarshipId: { feeId: fee.id, scholarshipId: scholarship.id } }, update: { amount, reason: scholarship.reason }, create: { feeId: fee.id, scholarshipId: scholarship.id, type: 'SCHOLARSHIP', amount, reason: scholarship.reason } });
      remaining -= amount;
    }
    await applyAdvance(tx, fee, date);
    created.push(fee);
  }
  return created;
}

export async function billFamilyFeePlan(tx: Db, planId: string, options: { date?: Date; onCreation?: boolean } = {}) {
  const date = schoolDate(options.date);
  const plan = await tx.familyFeePlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive || plan.startsAt > date || (plan.endsAt && plan.endsAt < date) || (!options.onCreation && !shouldBillNow(plan.frequency, date, false))) return null;
  const billingPeriod = periodFor(plan.frequency, date);
  const dueDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), plan.dueDay));
  const invoiceNo = `FAM-${billingPeriod.replace(/[^0-9A-Z]/gi, '')}-${plan.id.slice(-6).toUpperCase()}`;
  let fee = await tx.fee.findUnique({ where: { studentId_familyFeePlanId_billingPeriod: { studentId: plan.billingStudentId, familyFeePlanId: plan.id, billingPeriod } } });
  if (!fee) fee = await tx.fee.create({ data: { studentId: plan.billingStudentId, familyFeePlanId: plan.id, billingPeriod, invoiceNo, title: `${plan.name} · Family package · ${billingPeriod}`, amount: plan.amount, dueDate, status: 'PENDING' } });
  const charge = await tx.studentLedger.findFirst({ where: { studentId: plan.billingStudentId, referenceType: 'Fee', referenceId: fee.id } });
  if (!charge) await tx.studentLedger.create({ data: { studentId: plan.billingStudentId, type: 'CHARGE', amount: plan.amount, description: fee.title, referenceType: 'Fee', referenceId: fee.id, occurredAt: date } });
  await applyAdvance(tx, fee, date);
  return fee;
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
  const plans = await db.familyFeePlan.findMany({ where: { isActive: true, startsAt: { lte: schoolToday }, OR: [{ endsAt: null }, { endsAt: { gte: schoolToday } }] }, select: { id: true } });
  let familyInvoices = 0;
  for (const plan of plans) if (await db.$transaction(tx => billFamilyFeePlan(tx, plan.id, { date: schoolToday }), { timeout: 30_000 })) familyInvoices += 1;
  return { students: students.length, invoices, familyInvoices, billingDate: schoolToday.toISOString(), academicYear: academicYearFor(schoolToday) };
}
