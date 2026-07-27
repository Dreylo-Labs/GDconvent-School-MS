import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDb } from '../config/db.js';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import { academicYearFor, billStudentForClass, runMonthlyBilling, schoolDate } from '../services/fee-billing.js';

export const resourceRouter = Router();
const classDisplayName = (item: { name: string; section: string }) => item.section ? `${item.name}-${item.section}` : item.name;
const attendanceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const todayInSchoolTimezone = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.SCHOOL_TIMEZONE ?? 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const attendanceDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const normalizeIndianPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
};

async function teacherCanAccessClass(userId: string, classId: string) {
  return Boolean(await getDb().schoolClass.findFirst({ where: { id: classId, teacher: { userId } }, select: { id: true } }));
}
const studentSchema = z.object({ admissionNo: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: z.string().email().optional(), phone: z.string().optional(), dateOfBirth: z.coerce.date(), gender: z.enum(['MALE','FEMALE','OTHER']), address: z.string().optional(), guardianName: z.string().min(1), guardianPhone: z.string().min(1), classId: z.string().optional() });
const roomSchema = z.object({ name: z.string().min(1).max(100), type: z.string().min(1).max(60), capacity: z.coerce.number().int().positive().optional(), building: z.string().max(80).optional(), floor: z.string().max(40).optional(), notes: z.string().max(500).optional(), isActive: z.boolean().optional() });
const classSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sections: z.array(z.object({
    name: z.string().trim().max(20).default(''),
    roomId: z.string().optional(),
    teacherId: z.string().optional(),
  })).default([{ name: '' }]),
});
const teacherSchema = z.object({
  employeeNo: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30).optional(),
  subject: z.string().trim().max(100).optional(),
  qualification: z.string().trim().max(150).optional(),
  joinedAt: z.coerce.date().optional(),
  password: z.string().min(8).max(100).optional(),
  classIds: z.array(z.string()).default([]),
  roomAssignments: z.array(z.object({ roomId: z.string(), responsibility: z.string().trim().min(1).max(100) })).default([]),
});
const feeStructureSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().max(30).optional(),
  category: z.enum(['TUITION','ANNUAL','ADMISSION','DEVELOPMENT','COMPUTER','LAB','LIBRARY','SPORTS','ACTIVITY','TRANSPORT','EXAM','OTHER']),
  description: z.string().trim().max(300).optional(),
  className: z.string().trim().min(1).max(60),
  academicYear: z.string().trim().regex(/^\d{4}-\d{2}$/),
  amount: z.coerce.number().positive(),
  frequency: z.enum(['MONTHLY','QUARTERLY','ANNUAL','ONE_TIME']),
  dueDay: z.coerce.number().int().min(1).max(28).default(10),
  chargeOnAdmission: z.boolean().default(true),
  lateFee: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
});
const examPaperSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  componentType: z.enum(['THEORY','PRACTICAL','PROJECT','INTERNAL','ORAL']),
  date: z.coerce.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  room: z.string().trim().max(100).optional(),
  totalMarks: z.coerce.number().int().min(1).max(500),
  passingMarks: z.coerce.number().int().min(0).max(500),
  weight: z.coerce.number().min(0).max(100).optional(),
  teacherId: z.string().optional(),
  instructions: z.string().trim().max(1000).optional(),
});
const examPlanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  classId: z.string().min(1),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/),
  examType: z.enum(['CLASS_TEST','PERIODIC_TEST','UNIT_TEST','HALF_YEARLY','ANNUAL','PRE_BOARD','PRACTICAL','PROJECT','INTERNAL_ASSESSMENT','OTHER']),
  term: z.string().trim().max(60).optional(),
  papers: z.array(examPaperSchema).min(1).max(30),
});
const timetableSchema = z.object({
  classId: z.string().min(1), teacherId: z.string().min(1), roomId: z.string().optional().transform(value => value || undefined),
  subject: z.string().trim().min(1).max(100), dayOfWeek: z.coerce.number().int().min(1).max(6),
  period: z.coerce.number().int().min(1).max(20), startsAt: z.string().regex(/^\d{2}:\d{2}$/), endsAt: z.string().regex(/^\d{2}:\d{2}$/),
});
const teacherAttendanceStatus = z.enum(['PRESENT','ABSENT','LATE','HALF_DAY','ON_LEAVE']);

resourceRouter.get('/identifiers/next', authorize('ADMIN'), async (req, res) => {
  const type = String(req.query.type ?? '');
  if (type === 'student') {
    const year = z.coerce.number().int().min(1900).max(2200).safeParse(req.query.year);
    if (!year.success) return res.status(400).json({ message: 'A valid admission year is required.' });
    const prefix = `GD-${year.data}-`;
    const existing = await getDb().student.findMany({ where: { admissionNo: { startsWith: prefix } }, select: { admissionNo: true } });
    const lastValue = existing.reduce((max, item) => {
      const value = Number(item.admissionNo.slice(prefix.length));
      return Number.isInteger(value) ? Math.max(max, value) : max;
    }, 0);
    return res.json({ value: `${prefix}${String(lastValue + 1).padStart(3, '0')}`, year: year.data, lastValue });
  }
  if (type === 'employee') {
    const prefix = 'EMP-';
    const existing = await getDb().teacher.findMany({ where: { employeeNo: { startsWith: prefix } }, select: { employeeNo: true } });
    const lastValue = existing.reduce((max, item) => {
      const value = Number(item.employeeNo.slice(prefix.length));
      return Number.isInteger(value) ? Math.max(max, value) : max;
    }, 0);
    return res.json({ value: `${prefix}${String(lastValue + 1).padStart(3, '0')}`, lastValue });
  }
  return res.status(400).json({ message: 'Identifier type must be student or employee.' });
});

resourceRouter.get('/students', authorize('ADMIN', 'TEACHER'), async (req, res) => {
  const q = String(req.query.q ?? '');
  const classId = String(req.query.classId ?? '');
  const page = Math.max(1, Number(req.query.page ?? 1)); const limit = Math.min(100, Number(req.query.limit ?? 20));
  const where = { ...(classId ? { classId } : {}), ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' as const } }, { lastName: { contains: q, mode: 'insensitive' as const } }, { admissionNo: { contains: q, mode: 'insensitive' as const } }, { guardianName: { contains: q, mode: 'insensitive' as const } }] } : {}) };
  const [data, total] = await Promise.all([getDb().student.findMany({ where, include: { class: true }, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }), getDb().student.count({ where })]);
  res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
resourceRouter.post('/students', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const p = studentSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const guardianPhone = normalizeIndianPhone(p.data.guardianPhone);
  const studentPhone = p.data.phone ? normalizeIndianPhone(p.data.phone) : null;
  if (!guardianPhone) return res.status(400).json({ message: 'Enter a valid 10-digit Indian guardian mobile number.' });
  if (p.data.phone && !studentPhone) return res.status(400).json({ message: 'Enter a valid 10-digit Indian student mobile number.' });
  try {
    const placeholderPassword = await bcrypt.hash(`OTP-${crypto.randomUUID()}`, 12);
    const item = await getDb().$transaction(async tx => {
      const studentEmail = `student.${p.data.admissionNo.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@login.gdconvent.local`;
      const studentUser = await tx.user.create({ data: { email: studentEmail, name: `${p.data.firstName} ${p.data.lastName}`, password: placeholderPassword, role: 'STUDENT' } });
      const created = await tx.student.create({ data: { ...p.data, guardianPhone, phone: studentPhone ?? undefined, userId: studentUser.id }, include: { class: true } });
      let parent = await tx.parentProfile.findFirst({ where: { phone: guardianPhone } });
      if (!parent) {
        const parentEmail = `parent.${guardianPhone.slice(-10)}@login.gdconvent.local`;
        const parentUser = await tx.user.upsert({ where: { email: parentEmail }, update: { isActive: true, name: p.data.guardianName }, create: { email: parentEmail, name: p.data.guardianName, password: placeholderPassword, role: 'PARENT' } });
        parent = await tx.parentProfile.upsert({ where: { userId: parentUser.id }, update: { phone: guardianPhone }, create: { userId: parentUser.id, phone: guardianPhone } });
      }
      await tx.parentStudent.upsert({ where: { parentId_studentId: { parentId: parent.id, studentId: created.id } }, update: {}, create: { parentId: parent.id, studentId: created.id, relationship: 'Guardian', isPrimary: true } });
      if (created.class) await billStudentForClass(tx, created.id, created.class.name, { onAdmission: true });
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'CREATE', entityType: 'Student', entityId: created.id, metadata: { admissionNo: created.admissionNo, className: created.class?.name, feesStarted: Boolean(created.class), guardianAccountLinked: true, studentOtpLoginCreated: true } } });
      return created;
    }, { timeout: 30_000 });
    res.status(201).json(item);
  } catch {
    res.status(409).json({ message: 'This admission number is already in use. Choose another number or generate the next value.' });
  }
});
resourceRouter.get('/students/:id', authorize('ADMIN', 'TEACHER'), async (req, res) => { const item = await getDb().student.findUnique({ where: { id: String(req.params.id) }, include: { class: { include: { room: true, teacher: true } }, attendance: { orderBy: { date: 'desc' } }, fees: { include: { payments: true, concessions: true }, orderBy: { dueDate: 'desc' } }, ledgerEntries: { where: { referenceType: { in: ['ADVANCE_CREDIT','ADVANCE_ALLOCATION','ADVANCE_REFUND'] } }, orderBy: { occurredAt: 'desc' } }, results: { include: { exam: true }, orderBy: { exam: { date: 'desc' } } }, parents: { include: { parent: { include: { user: { select: { name: true, email: true } } } } } }, behaviorNotes: { include: { teacher: true }, orderBy: { occurredAt: 'desc' } }, promotions: { orderBy: { promotedAt: 'desc' } }, transportAssignment: { include: { stop: true, route: { include: { vehicle: true, stops: { orderBy: { sequence: 'asc' } } } } } } } }); if (!item) return res.status(404).json({ message: 'Student not found' }); const advance = item.ledgerEntries.reduce((sum, entry) => sum + Number(entry.amount), 0); const feeSummary = item.fees.reduce((summary, fee) => ({ billed: summary.billed + Number(fee.amount), paid: summary.paid + Number(fee.paidAmount), outstanding: summary.outstanding + Math.max(0, Number(fee.amount) - Number(fee.paidAmount) - fee.concessions.reduce((total, concession) => total + Number(concession.amount), 0)), advance: summary.advance }), { billed: 0, paid: 0, outstanding: 0, advance }); const attendanceSummary = item.attendance.reduce((summary, record) => ({ ...summary, total: summary.total + 1, [record.status.toLowerCase()]: summary[record.status.toLowerCase() as 'present'] + 1 }), { total: 0, present: 0, absent: 0, late: 0, excused: 0 }); res.json({ ...item, summaries: { fees: feeSummary, attendance: attendanceSummary } }); });
resourceRouter.put('/students/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const p = studentSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const normalizedGuardian = p.data.guardianPhone ? normalizeIndianPhone(p.data.guardianPhone) : undefined;
  const normalizedStudent = p.data.phone ? normalizeIndianPhone(p.data.phone) : undefined;
  if (p.data.guardianPhone && !normalizedGuardian) return res.status(400).json({ message: 'Enter a valid 10-digit Indian guardian mobile number.' });
  if (p.data.phone && !normalizedStudent) return res.status(400).json({ message: 'Enter a valid 10-digit Indian student mobile number.' });
  const placeholderPassword = await bcrypt.hash(`OTP-${crypto.randomUUID()}`, 12);
  const item = await getDb().$transaction(async tx => {
    const updated = await tx.student.update({ where: { id: String(req.params.id) }, data: { ...p.data, ...(normalizedGuardian ? { guardianPhone: normalizedGuardian } : {}), ...(normalizedStudent ? { phone: normalizedStudent } : {}) }, include: { class: true } });
    if (normalizedGuardian) {
      const currentPrimary = await tx.parentStudent.findFirst({ where: { studentId: updated.id, isPrimary: true }, include: { parent: true } });
      let parent = await tx.parentProfile.findFirst({ where: { phone: normalizedGuardian } });
      if (!parent) {
        if (currentPrimary) {
          parent = await tx.parentProfile.update({ where: { id: currentPrimary.parentId }, data: { phone: normalizedGuardian } });
          await tx.user.update({ where: { id: parent.userId }, data: { name: updated.guardianName, isActive: true } });
        } else {
          const email = `parent.${normalizedGuardian.slice(-10)}@login.gdconvent.local`;
          const parentUser = await tx.user.upsert({ where: { email }, update: { isActive: true, name: updated.guardianName }, create: { email, name: updated.guardianName, password: placeholderPassword, role: 'PARENT' } });
          parent = await tx.parentProfile.upsert({ where: { userId: parentUser.id }, update: { phone: normalizedGuardian }, create: { userId: parentUser.id, phone: normalizedGuardian } });
        }
      } else {
        await tx.user.update({ where: { id: parent.userId }, data: { name: updated.guardianName, isActive: true } });
      }
      await tx.parentStudent.upsert({ where: { parentId_studentId: { parentId: parent.id, studentId: updated.id } }, update: {}, create: { parentId: parent.id, studentId: updated.id, relationship: 'Guardian', isPrimary: true } });
      if (currentPrimary && currentPrimary.parentId !== parent.id) await tx.parentStudent.delete({ where: { parentId_studentId: { parentId: currentPrimary.parentId, studentId: updated.id } } });
    }
    if (p.data.classId && updated.class) await billStudentForClass(tx, updated.id, updated.class.name, { onAdmission: true });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'UPDATE', entityType: 'Student', entityId: updated.id, metadata: { classId: p.data.classId, feesStarted: Boolean(p.data.classId), guardianLoginUpdated: Boolean(normalizedGuardian) } } });
    return updated;
  }, { timeout: 30_000 });
  res.json(item);
});
resourceRouter.delete('/students/:id', authorize('ADMIN'), async (req: AuthRequest, res) => { const id = String(req.params.id); await getDb().$transaction([getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'DELETE', entityType: 'Student', entityId: id } }), getDb().student.delete({ where: { id } })]); res.status(204).send(); });

resourceRouter.get('/parents/me/children', authorize('PARENT'), async (req: AuthRequest, res) => {
  const profile = await getDb().parentProfile.findUnique({
    where: { userId: req.user!.id },
    include: {
      children: {
        include: {
          student: {
            include: {
              class: { include: { teacher: true, room: true } },
              attendance: { select: { status: true } },
              fees: { include: { concessions: true } },
              results: { include: { exam: true }, orderBy: { exam: { date: 'desc' } }, take: 5 },
            },
          },
        },
        orderBy: { student: { firstName: 'asc' } },
      },
    },
  });
  if (!profile) return res.status(404).json({ message: 'No guardian profile is linked to this account.' });
  res.json(profile.children.map(link => {
    const student = link.student;
    const marked = student.attendance.length;
    const attended = student.attendance.filter(record => record.status === 'PRESENT' || record.status === 'LATE').length;
    const feeSummary = student.fees.reduce((summary, fee) => ({
      billed: summary.billed + Number(fee.amount),
      paid: summary.paid + Number(fee.paidAmount),
      outstanding: summary.outstanding + feeOutstanding(fee),
    }), { billed: 0, paid: 0, outstanding: 0 });
    return {
      id: student.id,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      relationship: link.relationship,
      isPrimary: link.isPrimary,
      class: student.class,
      attendance: { marked, attended, percentage: marked ? Math.round(attended / marked * 1000) / 10 : 0 },
      fees: feeSummary,
      recentResults: student.results,
    };
  }));
});

const mobileStudentDetail = async (studentId: string, access: object) => {
  const student = await getDb().student.findFirst({
    where: { id: studentId, ...access },
    include: {
      class: { include: { teacher: true, room: true } },
      attendance: { orderBy: { date: 'desc' }, take: 370 },
      transportAssignment: { include: { stop: true, route: { include: { vehicle: true } } } },
    },
  });
  if (!student) return null;
  return {
    id: student.id,
    admissionNo: student.admissionNo,
    firstName: student.firstName,
    lastName: student.lastName,
    class: student.class,
    attendance: student.attendance,
    transportAssignment: student.transportAssignment,
  };
};

resourceRouter.get('/parents/me/children/:id', authorize('PARENT'), async (req: AuthRequest, res) => {
  const item = await mobileStudentDetail(String(req.params.id), { parents: { some: { parent: { userId: req.user!.id } } } });
  if (!item) return res.status(404).json({ message: 'This student is not linked to your guardian account.' });
  res.json(item);
});

resourceRouter.get('/students/me/mobile', authorize('STUDENT'), async (req: AuthRequest, res) => {
  const student = await getDb().student.findFirst({
    where: { userId: req.user!.id },
    include: {
      class: { include: { teacher: true, room: true } },
      attendance: { orderBy: { date: 'desc' } },
      fees: { include: { concessions: true } },
      results: { include: { exam: true }, orderBy: { exam: { date: 'desc' } }, take: 5 },
    },
  });
  if (!student) return res.status(404).json({ message: 'No student record is linked to this account.' });
  const marked = student.attendance.length;
  const attended = student.attendance.filter(record => record.status === 'PRESENT' || record.status === 'LATE').length;
  const feeSummary = student.fees.reduce((summary, fee) => ({
    billed: summary.billed + Number(fee.amount),
    paid: summary.paid + Number(fee.paidAmount),
    outstanding: summary.outstanding + feeOutstanding(fee),
  }), { billed: 0, paid: 0, outstanding: 0 });
  res.json({
    id: student.id, admissionNo: student.admissionNo, firstName: student.firstName, lastName: student.lastName,
    class: student.class, attendance: { marked, attended, percentage: marked ? Math.round(attended / marked * 1000) / 10 : 0 },
    fees: feeSummary, recentResults: student.results,
  });
});

resourceRouter.post('/students/:id/promote', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = z.object({ targetClassId: z.string().min(1), academicYear: z.string().min(4), feeStructureIds: z.array(z.string()).default([]), feeDueDate: z.coerce.date().optional(), note: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const studentId = String(req.params.id);
  const result = await getDb().$transaction(async tx => {
    const student = await tx.student.findUniqueOrThrow({ where: { id: studentId }, include: { class: true } });
    const targetClass = await tx.schoolClass.findUniqueOrThrow({ where: { id: parsed.data.targetClassId } });
    const structures = parsed.data.feeStructureIds.length ? await tx.feeStructure.findMany({ where: { id: { in: parsed.data.feeStructureIds }, isActive: true } }) : [];
    if (structures.some(structure => structure.className && structure.className !== targetClass.name)) throw new Error('A selected fee structure does not apply to the destination class');
    const updated = await tx.student.update({ where: { id: studentId }, data: { classId: targetClass.id }, include: { class: true } });
    const history = await tx.promotionHistory.create({ data: { studentId, fromClassId: student.classId, fromClassName: student.class ? classDisplayName(student.class) : null, toClassId: targetClass.id, toClassName: classDisplayName(targetClass), academicYear: parsed.data.academicYear, promotedById: req.user!.id, note: parsed.data.note } });
    const generatedFees = await billStudentForClass(tx, studentId, targetClass.name, { onAdmission: true });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'PROMOTE', entityType: 'Student', entityId: studentId, metadata: { from: history.fromClassName, to: history.toClassName, academicYear: history.academicYear, feeStructures: generatedFees.map(item => item.feeStructureId) } } });
    return updated;
  }, { timeout: 30_000 });
  res.json(result);
});

resourceRouter.get('/teachers/me', authorize('TEACHER'), async (req: AuthRequest, res) => {
  const teacher = await getDb().teacher.findUnique({
    where: { userId: req.user!.id },
    include: {
      classes: { include: { room: true, _count: { select: { students: true } } }, orderBy: [{ name: 'asc' }, { section: 'asc' }] },
      roomAssignments: { include: { room: true }, orderBy: { room: { name: 'asc' } } },
    },
  });
  if (!teacher) return res.status(404).json({ message: 'No teacher profile is linked to this account.' });
  const classIds = teacher.classes.map(item => item.id);
  const [students, markedToday, pendingResults] = await Promise.all([
    getDb().student.count({ where: { classId: { in: classIds } } }),
    getDb().attendance.count({ where: { student: { classId: { in: classIds } }, date: attendanceDate(todayInSchoolTimezone()) } }),
    getDb().examResult.count({ where: { exam: { teacherId: teacher.id }, grade: null } }),
  ]);
  res.json({ ...teacher, summaries: { students, classes: teacher.classes.length, markedToday, pendingResults } });
});
resourceRouter.get('/teachers', authorize('ADMIN'), async (_req, res) => res.json(await getDb().teacher.findMany({ include: { user: { select: { isActive: true, lastLoginAt: true } }, classes: { include: { room: true, _count: { select: { students: true } } } }, roomAssignments: { include: { room: true } } }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] })));
resourceRouter.post('/teachers', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = teacherSchema.extend({ password: z.string().min(8).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const { password, classIds, roomAssignments, ...profile } = parsed.data;
  try {
    const teacher = await getDb().$transaction(async tx => {
      const user = await tx.user.create({ data: { email: profile.email, name: `${profile.firstName} ${profile.lastName}`, password: await bcrypt.hash(password, 12), role: 'TEACHER' } });
      const item = await tx.teacher.create({ data: { ...profile, userId: user.id } });
      if (classIds.length) await tx.schoolClass.updateMany({ where: { id: { in: classIds } }, data: { teacherId: item.id } });
      if (roomAssignments.length) await tx.teacherRoomAssignment.createMany({ data: roomAssignments.map(assignment => ({ teacherId: item.id, ...assignment })) });
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'CREATE', entityType: 'Teacher', entityId: item.id, metadata: { employeeNo: item.employeeNo, classIds, roomAssignments } } });
      return item;
    }, { timeout: 30_000 });
    res.status(201).json(teacher);
  } catch {
    res.status(409).json({ message: 'A teacher with this employee number or email already exists.' });
  }
});
resourceRouter.put('/teachers/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = teacherSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const teacherId = String(req.params.id);
  const { password, classIds, roomAssignments, ...profile } = parsed.data;
  try {
    const teacher = await getDb().$transaction(async tx => {
      const current = await tx.teacher.findUniqueOrThrow({ where: { id: teacherId } });
      const item = await tx.teacher.update({ where: { id: teacherId }, data: profile });
      if (current.userId) await tx.user.update({ where: { id: current.userId }, data: { email: item.email, name: `${item.firstName} ${item.lastName}`, ...(password ? { password: await bcrypt.hash(password, 12) } : {}) } });
      if (classIds) {
        await tx.schoolClass.updateMany({ where: { teacherId }, data: { teacherId: null } });
        if (classIds.length) await tx.schoolClass.updateMany({ where: { id: { in: classIds } }, data: { teacherId } });
      }
      if (roomAssignments) {
        await tx.teacherRoomAssignment.deleteMany({ where: { teacherId } });
        if (roomAssignments.length) await tx.teacherRoomAssignment.createMany({ data: roomAssignments.map(assignment => ({ teacherId, ...assignment })) });
      }
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'UPDATE', entityType: 'Teacher', entityId: teacherId, metadata: { classIds, roomAssignments, passwordReset: Boolean(password) } } });
      return item;
    }, { timeout: 30_000 });
    res.json(teacher);
  } catch {
    res.status(409).json({ message: 'The teacher could not be updated. Check the email and employee number.' });
  }
});
resourceRouter.delete('/teachers/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const teacherId = String(req.params.id);
  const teacher = await getDb().teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) return res.status(404).json({ message: 'Teacher not found.' });
  await getDb().$transaction(async tx => {
    await tx.schoolClass.updateMany({ where: { teacherId }, data: { teacherId: null } });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'DELETE', entityType: 'Teacher', entityId: teacherId, metadata: { employeeNo: teacher.employeeNo, email: teacher.email } } });
    await tx.teacher.delete({ where: { id: teacherId } });
    if (teacher.userId) await tx.user.delete({ where: { id: teacher.userId } });
  }, { timeout: 30_000 });
  res.status(204).send();
});
resourceRouter.get('/classes', authorize('ADMIN', 'TEACHER', 'ACCOUNTANT'), async (_req, res) => res.json(await getDb().schoolClass.findMany({ include: { teacher: true, room: true, _count: { select: { students: true } } }, orderBy: [{ name: 'asc' }, { section: 'asc' }] })));
resourceRouter.get('/fee-structures', authorize('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const className = String(req.query.className ?? ''); const academicYear = String(req.query.academicYear ?? '');
  res.json(await getDb().feeStructure.findMany({ where: { ...(String(req.query.all ?? '') === 'true' ? {} : { isActive: true }), ...(academicYear ? { academicYear } : {}), ...(className ? { OR: [{ className }, { className: null }] } : {}) }, orderBy: [{ className: 'asc' }, { name: 'asc' }] }));
});
resourceRouter.post('/fee-structures', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = feeStructureSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try { const item = await getDb().feeStructure.create({ data: parsed.data }); await getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'CREATE', entityType: 'FeeStructure', entityId: item.id, metadata: parsed.data } }); res.status(201).json(item); }
  catch { res.status(409).json({ message: 'This fee head already exists for the selected class and academic year.' }); }
});
resourceRouter.put('/fee-structures/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = feeStructureSchema.partial().safeParse(req.body); if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try { const item = await getDb().feeStructure.update({ where: { id: String(req.params.id) }, data: parsed.data }); await getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'UPDATE', entityType: 'FeeStructure', entityId: item.id, metadata: parsed.data } }); res.json(item); }
  catch { res.status(409).json({ message: 'The fee head could not be updated.' }); }
});
resourceRouter.delete('/fee-structures/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const id = String(req.params.id); const item = await getDb().feeStructure.update({ where: { id }, data: { isActive: false } }); await getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'DEACTIVATE', entityType: 'FeeStructure', entityId: id } }); res.json(item);
});
resourceRouter.post('/fee-billing/run', authorize('ADMIN', 'ACCOUNTANT'), async (req: AuthRequest, res) => {
  const parsed = z.object({ date: z.coerce.date().optional() }).safeParse(req.body); if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const result = await runMonthlyBilling(parsed.data.date); await getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'RUN_MONTHLY_BILLING', entityType: 'FeeBilling', entityId: result.academicYear, metadata: result } }); res.json(result);
});
resourceRouter.get('/fee-billing/status', authorize('ADMIN', 'ACCOUNTANT'), async (_req, res) => {
  const date = schoolDate(); const academicYear = academicYearFor(date); const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const [structures, invoices, students] = await Promise.all([getDb().feeStructure.count({ where: { academicYear, isActive: true } }), getDb().fee.count({ where: { billingPeriod: period } }), getDb().student.count({ where: { classId: { not: null } } })]);
  res.json({ academicYear, period, structures, invoices, students, nextAutomaticRun: nextMonth.toISOString().slice(0, 10) });
});
resourceRouter.post('/classes', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const p = classSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const sections = p.data.sections.length ? p.data.sections : [{ name: '' }];
  try {
    const created = await getDb().$transaction(async tx => {
      const items = [];
      for (const section of sections) {
        items.push(await tx.schoolClass.create({
          data: { name: p.data.name, section: section.name.toUpperCase(), roomId: section.roomId || null, teacherId: section.teacherId || null },
          include: { room: true, teacher: true, _count: { select: { students: true } } },
        }));
      }
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'CREATE', entityType: 'SchoolClass', entityId: items[0].id, metadata: { name: p.data.name, sections: items.map(item => item.section) } } });
      return items;
    }, { timeout: 30_000 });
    res.status(201).json(created);
  } catch {
    res.status(409).json({ message: 'This class and section already exists.' });
  }
});
resourceRouter.put('/classes/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const p = z.object({ name: z.string().trim().min(1).optional(), section: z.string().trim().max(20).optional(), roomId: z.string().nullable().optional(), teacherId: z.string().nullable().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  try {
    const item = await getDb().schoolClass.update({ where: { id: String(req.params.id) }, data: { ...p.data, section: p.data.section?.toUpperCase() }, include: { room: true, teacher: true, _count: { select: { students: true } } } });
    await getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'UPDATE', entityType: 'SchoolClass', entityId: item.id } });
    res.json(item);
  } catch {
    res.status(409).json({ message: 'This class and section already exists.' });
  }
});
resourceRouter.delete('/classes/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const students = await getDb().student.count({ where: { classId: id } });
  if (students) return res.status(409).json({ message: `Move the ${students} assigned student${students === 1 ? '' : 's'} before deleting this class.` });
  await getDb().$transaction([getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'DELETE', entityType: 'SchoolClass', entityId: id } }), getDb().schoolClass.delete({ where: { id } })]);
  res.status(204).send();
});

resourceRouter.get('/rooms', authorize('ADMIN', 'TEACHER'), async (_req, res) => res.json(await getDb().room.findMany({ include: { _count: { select: { sections: true } } }, orderBy: [{ type: 'asc' }, { name: 'asc' }] })));
resourceRouter.post('/rooms', authorize('ADMIN'), async (req, res) => { const p = roomSchema.safeParse(req.body); if (!p.success) return res.status(400).json(p.error.flatten()); res.status(201).json(await getDb().room.create({ data: p.data })); });
resourceRouter.put('/rooms/:id', authorize('ADMIN'), async (req, res) => { const p = roomSchema.partial().safeParse(req.body); if (!p.success) return res.status(400).json(p.error.flatten()); res.json(await getDb().room.update({ where: { id: String(req.params.id) }, data: p.data })); });
resourceRouter.delete('/rooms/:id', authorize('ADMIN'), async (req, res) => { await getDb().room.delete({ where: { id: String(req.params.id) } }); res.status(204).send(); });
const feeAccessWhere = (req: AuthRequest) => req.user!.role === 'PARENT'
  ? { student: { parents: { some: { parent: { userId: req.user!.id } } } } }
  : req.user!.role === 'STUDENT' ? { student: { userId: req.user!.id } } : {};
const feeOutstanding = (fee: { amount: unknown; paidAmount: unknown; concessions: { amount: unknown }[] }) =>
  Math.max(0, Number(fee.amount) - Number(fee.paidAmount) - fee.concessions.reduce((sum, item) => sum + Number(item.amount), 0));
const advanceBalance = (entries: { amount: unknown }[]) => entries.reduce((sum, entry) => sum + Number(entry.amount), 0);
const paymentMethodSchema = z.enum(['CASH','CARD','UPI','BANK_TRANSFER','CHEQUE','OTHER']);

resourceRouter.get('/finance/students', authorize('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const classId = String(req.query.classId ?? '');
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const where = {
    ...(classId ? { classId } : {}),
    ...(q ? { OR: [
      { firstName: { contains: q, mode: 'insensitive' as const } },
      { lastName: { contains: q, mode: 'insensitive' as const } },
      { admissionNo: { contains: q, mode: 'insensitive' as const } },
      { guardianName: { contains: q, mode: 'insensitive' as const } },
      { guardianPhone: { contains: q } },
    ] } : {}),
  };
  const [students, total] = await Promise.all([
    getDb().student.findMany({
      where,
      select: {
        id: true, admissionNo: true, firstName: true, lastName: true, guardianName: true, guardianPhone: true, createdAt: true,
        class: { select: { id: true, name: true, section: true } },
        fees: { select: { amount: true, paidAmount: true, concessions: { select: { amount: true } } } },
        ledgerEntries: { where: { referenceType: { in: ['ADVANCE_CREDIT','ADVANCE_ALLOCATION','ADVANCE_REFUND'] } }, select: { amount: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    getDb().student.count({ where }),
  ]);
  res.json({
    data: students.map(student => ({
      id: student.id,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      createdAt: student.createdAt,
      class: student.class,
      billed: student.fees.reduce((sum, fee) => sum + Number(fee.amount), 0),
      collected: student.fees.reduce((sum, fee) => sum + Number(fee.paidAmount), 0),
      outstanding: student.fees.reduce((sum, fee) => sum + feeOutstanding(fee), 0),
      advanceBalance: advanceBalance(student.ledgerEntries),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

resourceRouter.get('/fees/counter/students', authorize('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json([]);
  const students = await getDb().student.findMany({
    where: { OR: [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { admissionNo: { contains: q, mode: 'insensitive' } },
      { guardianName: { contains: q, mode: 'insensitive' } },
      { guardianPhone: { contains: q } },
    ] },
    select: {
      id: true, admissionNo: true, firstName: true, lastName: true, guardianName: true, guardianPhone: true,
      class: { select: { id: true, name: true, section: true } },
      fees: { where: { status: { in: ['PENDING','PARTIAL','OVERDUE'] } }, select: { amount: true, paidAmount: true, concessions: { select: { amount: true } } } },
      ledgerEntries: { where: { referenceType: { in: ['ADVANCE_CREDIT','ADVANCE_ALLOCATION','ADVANCE_REFUND'] } }, select: { amount: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 20,
  });
  res.json(students.map(student => ({
    ...student,
    outstanding: student.fees.reduce((sum, fee) => sum + feeOutstanding(fee), 0),
    advanceBalance: advanceBalance(student.ledgerEntries),
    fees: undefined,
    ledgerEntries: undefined,
  })));
});

resourceRouter.get('/fees', authorize('ADMIN', 'PARENT', 'STUDENT', 'ACCOUNTANT'), async (req: AuthRequest, res) => {
  const q = String(req.query.q ?? '').trim();
  const classId = String(req.query.classId ?? '');
  const studentId = String(req.query.studentId ?? '');
  const status = String(req.query.status ?? '');
  const page = Math.max(1, Number(req.query.page ?? 1)); const limit = Math.min(100, Number(req.query.limit ?? 20));
  const access = feeAccessWhere(req);
  const where = {
    ...access,
    ...(classId || studentId ? { student: { ...(access.student ?? {}), ...(classId ? { classId } : {}), ...(studentId ? { id: studentId } : {}) } } : {}),
    ...(status ? { status: status as 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED' } : {}),
    ...(q ? { student: { ...(access.student ?? {}), OR: [{ firstName: { contains: q, mode: 'insensitive' as const } }, { lastName: { contains: q, mode: 'insensitive' as const } }, { admissionNo: { contains: q, mode: 'insensitive' as const } }] } } : {}),
  };
  const [fees, total, summaryFees] = await Promise.all([
    getDb().fee.findMany({ where, include: { student: { include: { class: true } }, payments: { orderBy: { paidAt: 'desc' } }, concessions: true }, orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
    getDb().fee.count({ where }),
    getDb().fee.findMany({ where, select: { amount: true, paidAmount: true, concessions: { select: { amount: true } } } }),
  ]);
  const data = fees.map(fee => ({ ...fee, outstanding: feeOutstanding(fee) }));
  const aggregate = summaryFees.reduce((sum, fee) => ({ billed: sum.billed + Number(fee.amount), collected: sum.collected + Number(fee.paidAmount), outstanding: sum.outstanding + feeOutstanding(fee) }), { billed: 0, collected: 0, outstanding: 0 });
  const advanceStudentAccess = req.user!.role === 'PARENT'
    ? { parents: { some: { parent: { userId: req.user!.id } } } }
    : req.user!.role === 'STUDENT' ? { userId: req.user!.id } : {};
  const advanceWhere = {
    referenceType: { in: ['ADVANCE_CREDIT','ADVANCE_ALLOCATION','ADVANCE_REFUND'] },
    student: {
      ...advanceStudentAccess,
      ...(classId ? { classId } : {}),
      ...(studentId ? { id: studentId } : {}),
      ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' as const } }, { lastName: { contains: q, mode: 'insensitive' as const } }, { admissionNo: { contains: q, mode: 'insensitive' as const } }] } : {}),
    },
  };
  const advances = await getDb().studentLedger.findMany({ where: advanceWhere, include: { student: { include: { class: true } } }, orderBy: { occurredAt: 'desc' }, take: 50 });
  const advance = advanceBalance(advances);
  res.json({ data, advances, summary: { ...aggregate, advance }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

resourceRouter.get('/fees/students/:id', authorize('ADMIN', 'PARENT', 'STUDENT', 'ACCOUNTANT'), async (req: AuthRequest, res) => {
  const studentId = String(req.params.id);
  const student = await getDb().student.findFirst({
    where: { id: studentId, ...(req.user!.role === 'PARENT' ? { parents: { some: { parent: { userId: req.user!.id } } } } : req.user!.role === 'STUDENT' ? { userId: req.user!.id } : {}) },
    include: {
      class: true,
      fees: { include: { payments: { orderBy: { paidAt: 'desc' } }, concessions: true }, orderBy: { dueDate: 'desc' } },
      ledgerEntries: { where: { referenceType: { in: ['ADVANCE_CREDIT','ADVANCE_ALLOCATION','ADVANCE_REFUND'] } }, orderBy: { occurredAt: 'desc' } },
    },
  });
  if (!student) return res.status(404).json({ message: 'Student fee account not found.' });
  const fees = student.fees.map(fee => ({ ...fee, outstanding: feeOutstanding(fee) }));
  const summary = fees.reduce((sum, fee) => ({ billed: sum.billed + Number(fee.amount), collected: sum.collected + Number(fee.paidAmount), concessions: sum.concessions + fee.concessions.reduce((value, item) => value + Number(item.amount), 0), outstanding: sum.outstanding + fee.outstanding }), { billed: 0, collected: 0, concessions: 0, outstanding: 0 });
  res.json({ ...student, fees, summary: { ...summary, advanceBalance: advanceBalance(student.ledgerEntries) } });
});

resourceRouter.post('/fees/:id/payments', authorize('ADMIN', 'ACCOUNTANT'), async (req: AuthRequest, res) => {
  const parsed = z.object({ amount: z.coerce.number().positive(), method: paymentMethodSchema, transactionRef: z.string().trim().max(100).optional(), paidAt: z.coerce.date().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const feeId = String(req.params.id);
  try {
    const result = await getDb().$transaction(async tx => {
      const fee = await tx.fee.findUniqueOrThrow({ where: { id: feeId }, include: { concessions: true, student: true } });
      const outstanding = feeOutstanding(fee);
      if (outstanding <= 0) throw new Error('This invoice has no outstanding balance.');
      if (parsed.data.amount > outstanding) throw new Error(`Payment cannot exceed the outstanding balance of INR ${outstanding.toFixed(2)}.`);
      const newPaid = Number(fee.paidAmount) + parsed.data.amount;
      const remaining = outstanding - parsed.data.amount;
      const paidAt = parsed.data.paidAt ?? new Date();
      const receiptNo = `REC-${paidAt.getUTCFullYear()}-${Date.now().toString().slice(-8)}`;
      const payment = await tx.feePayment.create({ data: { feeId, receiptNo, amount: parsed.data.amount, method: parsed.data.method, transactionRef: parsed.data.transactionRef, receivedById: req.user!.id, paidAt } });
      const updated = await tx.fee.update({ where: { id: feeId }, data: { paidAmount: newPaid, status: remaining <= 0 ? 'PAID' : 'PARTIAL', paidAt: remaining <= 0 ? paidAt : null } });
      await tx.studentLedger.create({ data: { studentId: fee.studentId, type: 'PAYMENT', amount: parsed.data.amount, description: `Payment for ${fee.title}`, referenceType: 'FeePayment', referenceId: payment.id, occurredAt: paidAt } });
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'COLLECT_PAYMENT', entityType: 'Fee', entityId: feeId, ipAddress: req.ip, userAgent: req.headers['user-agent'], metadata: { studentId: fee.studentId, receiptNo, amount: parsed.data.amount, method: parsed.data.method, previousOutstanding: outstanding, remainingOutstanding: Math.max(0, remaining) } } });
      return { payment, fee: updated, outstanding: Math.max(0, remaining) };
    }, { timeout: 30_000 });
    res.status(201).json(result);
  } catch (reason) {
    res.status(400).json({ message: reason instanceof Error ? reason.message : 'Payment could not be collected.' });
  }
});

resourceRouter.post('/fees/students/:id/advance', authorize('ADMIN', 'ACCOUNTANT'), async (req: AuthRequest, res) => {
  const parsed = z.object({ amount: z.coerce.number().positive(), method: paymentMethodSchema, transactionRef: z.string().trim().max(100).optional(), note: z.string().trim().max(250).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const studentId = String(req.params.id);
  try {
    const result = await getDb().$transaction(async tx => {
      const student = await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { id: true, admissionNo: true } });
      const receiptNo = `ADV-${new Date().getUTCFullYear()}-${Date.now().toString().slice(-8)}`;
      const entry = await tx.studentLedger.create({ data: {
        studentId, type: 'ADJUSTMENT', amount: parsed.data.amount,
        description: `Advance fee received via ${parsed.data.method}${parsed.data.note ? ` · ${parsed.data.note}` : ''}`,
        referenceType: 'ADVANCE_CREDIT', referenceId: receiptNo,
      } });
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'COLLECT_ADVANCE', entityType: 'Student', entityId: studentId, ipAddress: req.ip, userAgent: req.headers['user-agent'], metadata: { admissionNo: student.admissionNo, receiptNo, ...parsed.data } } });
      return { entry, receiptNo, amount: parsed.data.amount };
    }, { timeout: 30_000 });
    res.status(201).json(result);
  } catch {
    res.status(404).json({ message: 'Student fee account not found.' });
  }
});

resourceRouter.post('/fees/students/:id/charges', authorize('ADMIN', 'ACCOUNTANT'), async (req: AuthRequest, res) => {
  const parsed = z.object({
    title: z.string().trim().min(2).max(120),
    category: z.enum(['TOUR','ACTIVITY','TRANSPORT','UNIFORM','BOOKS','EXAM','FINE','OTHER']),
    amount: z.coerce.number().positive(),
    dueDate: z.coerce.date(),
    collectAmount: z.coerce.number().min(0).default(0),
    method: paymentMethodSchema.default('CASH'),
    transactionRef: z.string().trim().max(100).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (parsed.data.collectAmount > parsed.data.amount) return res.status(400).json({ message: 'Collected amount cannot exceed the new charge.' });
  const studentId = String(req.params.id);
  try {
    const result = await getDb().$transaction(async tx => {
      await tx.student.findUniqueOrThrow({ where: { id: studentId } });
      const now = new Date();
      const invoiceNo = `INV-${now.getUTCFullYear()}-${Date.now().toString().slice(-8)}`;
      const paid = parsed.data.collectAmount;
      const fee = await tx.fee.create({ data: {
        studentId, invoiceNo, title: `${parsed.data.title} · ${parsed.data.category}`,
        amount: parsed.data.amount, paidAmount: paid, dueDate: parsed.data.dueDate,
        status: paid >= parsed.data.amount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
        paidAt: paid >= parsed.data.amount ? now : null,
      } });
      await tx.studentLedger.create({ data: { studentId, type: 'CHARGE', amount: parsed.data.amount, description: `Charge: ${parsed.data.title}`, referenceType: 'Fee', referenceId: fee.id } });
      let payment = null;
      if (paid > 0) {
        const receiptNo = `REC-${now.getUTCFullYear()}-${Date.now().toString().slice(-8)}`;
        payment = await tx.feePayment.create({ data: { feeId: fee.id, receiptNo, amount: paid, method: parsed.data.method, transactionRef: parsed.data.transactionRef, receivedById: req.user!.id } });
        await tx.studentLedger.create({ data: { studentId, type: 'PAYMENT', amount: paid, description: `Payment for ${parsed.data.title}`, referenceType: 'FeePayment', referenceId: payment.id } });
      }
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'CREATE_FEE_CHARGE', entityType: 'Fee', entityId: fee.id, ipAddress: req.ip, userAgent: req.headers['user-agent'], metadata: { studentId, category: parsed.data.category, amount: parsed.data.amount, collected: paid } } });
      return { fee, payment, outstanding: parsed.data.amount - paid };
    }, { timeout: 30_000 });
    res.status(201).json(result);
  } catch {
    res.status(404).json({ message: 'Student fee account not found.' });
  }
});

resourceRouter.get('/fees/:id/invoice.pdf', authorize('ADMIN', 'PARENT', 'STUDENT', 'ACCOUNTANT'), async (req: AuthRequest, res) => {
  const fee = await getDb().fee.findFirst({ where: { id: String(req.params.id), ...feeAccessWhere(req) }, include: { student: { include: { class: true } }, payments: { orderBy: { paidAt: 'asc' } }, concessions: true } });
  if (!fee) return res.status(404).json({ message: 'Invoice not found.' });
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.04, 0.16, 0.32); const blue = rgb(0.08, 0.39, 0.86); const gray = rgb(0.38, 0.44, 0.53); const line = rgb(0.87, 0.89, 0.93);
  page.drawRectangle({ x: 0, y: 760, width: 595.28, height: 81.89, color: navy });
  page.drawText('GD SCHOOL', { x: 42, y: 796, size: 20, font: bold, color: rgb(1,1,1) });
  page.drawText('FEE INVOICE', { x: 430, y: 798, size: 13, font: bold, color: rgb(1,1,1) });
  page.drawText(fee.invoiceNo ?? `INV-${fee.id.slice(-8).toUpperCase()}`, { x: 430, y: 780, size: 9, font: regular, color: rgb(.82,.88,.96) });
  const label = (text: string, value: string, x: number, y: number) => { page.drawText(text.toUpperCase(), { x, y, size: 7, font: bold, color: gray }); page.drawText(value, { x, y: y - 17, size: 10, font: regular, color: navy }); };
  label('Student', `${fee.student.firstName} ${fee.student.lastName}`, 42, 722); label('Admission no.', fee.student.admissionNo, 220, 722); label('Class', fee.student.class ? classDisplayName(fee.student.class) : 'Unassigned', 400, 722);
  label('Invoice date', new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(fee.createdAt), 42, 666); label('Due date', new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(fee.dueDate), 220, 666); label('Status', fee.status, 400, 666);
  page.drawRectangle({ x: 42, y: 570, width: 511, height: 42, color: rgb(.96,.97,.99) });
  page.drawText('DESCRIPTION', { x: 56, y: 587, size: 8, font: bold, color: gray }); page.drawText('AMOUNT', { x: 470, y: 587, size: 8, font: bold, color: gray });
  page.drawText(fee.title, { x: 56, y: 548, size: 11, font: regular, color: navy }); page.drawText(`INR ${Number(fee.amount).toFixed(2)}`, { x: 460, y: 548, size: 10, font: bold, color: navy });
  page.drawLine({ start: { x: 42, y: 528 }, end: { x: 553, y: 528 }, thickness: 1, color: line });
  const concessions = fee.concessions.reduce((sum,item)=>sum+Number(item.amount),0); const outstanding = feeOutstanding(fee);
  [['Billed',Number(fee.amount)],['Concessions',concessions],['Paid',Number(fee.paidAmount)],['Outstanding',outstanding]].forEach(([name,value],index) => { const y=500-index*27; page.drawText(String(name),{x:380,y,size:9,font:regular,color:gray}); page.drawText(`INR ${Number(value).toFixed(2)}`,{x:470,y,size:9,font:index===3?bold:regular,color:index===3?blue:navy}); });
  page.drawText('PAYMENT HISTORY', { x: 42, y: 380, size: 9, font: bold, color: navy });
  fee.payments.slice(0,8).forEach((payment,index) => { const y=355-index*24; page.drawText(payment.receiptNo,{x:42,y,size:8,font:regular,color:navy}); page.drawText(new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(payment.paidAt),{x:210,y,size:8,font:regular,color:gray}); page.drawText(payment.method,{x:340,y,size:8,font:regular,color:gray}); page.drawText(`INR ${Number(payment.amount).toFixed(2)}`,{x:470,y,size:8,font:bold,color:navy}); });
  page.drawText('This is a system-generated fee invoice.', { x: 42, y: 55, size: 8, font: regular, color: gray }); page.drawText('GD School Management System', { x: 408, y: 55, size: 8, font: bold, color: navy });
  const bytes = await pdf.save();
  res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="${fee.invoiceNo ?? 'fee-invoice'}.pdf"`); res.send(Buffer.from(bytes));
});
resourceRouter.get('/exams', authorize('ADMIN', 'TEACHER', 'PARENT', 'STUDENT'), async (req: AuthRequest, res) => {
  const academicYear = String(req.query.academicYear ?? '');
  const classId = String(req.query.classId ?? '');
  const roleWhere = req.user!.role === 'ADMIN' ? {} : req.user!.role === 'TEACHER'
    ? { OR: [{ class: { teacher: { userId: req.user!.id } } }, { teacher: { userId: req.user!.id } }] }
    : req.user!.role === 'STUDENT'
      ? { class: { students: { some: { userId: req.user!.id } } }, status: { not: 'DRAFT' } }
      : { class: { students: { some: { parents: { some: { parent: { userId: req.user!.id } } } } } }, status: { not: 'DRAFT' } };
  const items = await getDb().exam.findMany({
    where: { ...roleWhere, ...(academicYear ? { academicYear } : {}), ...(classId ? { classId } : {}) },
    include: { class: { include: { _count: { select: { students: true } } } }, teacher: true, _count: { select: { results: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
  res.json(items);
});

resourceRouter.get('/exams/my-results', authorize('PARENT', 'STUDENT'), async (req: AuthRequest, res) => {
  const studentWhere = req.user!.role === 'STUDENT'
    ? { userId: req.user!.id }
    : { parents: { some: { parent: { userId: req.user!.id } } } };
  const results = await getDb().examResult.findMany({
    where: { student: studentWhere, exam: { status: 'PUBLISHED' } },
    include: { student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, class: true } }, exam: { include: { class: true } } },
    orderBy: { exam: { date: 'desc' } },
  });
  res.json(results);
});

resourceRouter.get('/students/:id/report-card.pdf', authorize('ADMIN','TEACHER','PARENT','STUDENT'), async (req: AuthRequest, res) => {
  const studentId = String(req.params.id);
  const academicYear = String(req.query.academicYear ?? '').trim();
  const term = String(req.query.term ?? '').trim();
  const role = req.user!.role;
  const access = role === 'PARENT'
    ? { parents: { some: { parent: { userId: req.user!.id } } } }
    : role === 'STUDENT' ? { userId: req.user!.id }
      : role === 'TEACHER' ? { class: { teacher: { userId: req.user!.id } } } : {};
  const student = await getDb().student.findFirst({
    where: { id: studentId, ...access },
    include: {
      class: { include: { teacher: true } },
      results: {
        where: { exam: { ...(academicYear ? { academicYear } : {}), ...(term ? { term } : {}), ...(role === 'PARENT' || role === 'STUDENT' ? { status: 'PUBLISHED' } : { status: { not: 'DRAFT' } }) } },
        include: { exam: true },
        orderBy: { exam: { date: 'asc' } },
      },
    },
  });
  if (!student) return res.status(404).json({ message: 'Student report card is not available to this account.' });
  if (!student.results.length) return res.status(404).json({ message: 'No eligible examination results are available for this report card.' });
  const resolvedYear = academicYear || student.results[0].exam.academicYear;
  const yearStart = Number(resolvedYear.slice(0,4));
  const attendanceFrom = Number.isFinite(yearStart) ? new Date(Date.UTC(yearStart,3,1)) : new Date(Date.UTC(new Date().getUTCFullYear(),3,1));
  const attendanceTo = new Date(Date.UTC(attendanceFrom.getUTCFullYear()+1,2,31,23,59,59));
  const attendance = await getDb().attendance.findMany({ where: { studentId, date: { gte: attendanceFrom, lte: attendanceTo } }, select: { status: true } });

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number,number] = [595.28,841.89];
  let page = pdf.addPage(pageSize);
  const navy = rgb(0.02,0.15,0.33), blue = rgb(0.09,0.41,0.88), grey = rgb(0.36,0.41,0.49), line = rgb(0.84,0.87,0.91), green = rgb(0.05,0.5,0.25), red = rgb(0.78,0.16,0.16);
  const margin = 42; let y = 798;
  const text = (value:string,x:number,atY:number,size=9,font=regular,color=navy) => page.drawText(value,{x,y:atY,size,font,color});
  const rule = (atY:number,thickness=1,color=line) => page.drawLine({start:{x:margin,y:atY},end:{x:pageSize[0]-margin,y:atY},thickness,color});
  page.drawRectangle({x:0,y:766,width:pageSize[0],height:76,color:navy});
  text('G.D. CONVENT SR SEC SCHOOL',margin,812,18,bold,rgb(1,1,1));
  text('Affiliated Senior Secondary Institution',margin,794,9,regular,rgb(.82,.89,1));
  text('STUDENT REPORT CARD',pageSize[0]-205,805,13,bold,rgb(1,.88,.1));
  text(`Academic Session: ${resolvedYear}`,pageSize[0]-205,787,9,regular,rgb(1,1,1));
  y=742;
  text('STUDENT INFORMATION',margin,y,10,bold,blue); y-=13; rule(y); y-=19;
  const studentRows=[
    ['Student name',`${student.firstName} ${student.lastName}`,'Admission no.',student.admissionNo],
    ['Class / section',student.class ? classDisplayName(student.class) : 'Unassigned','Date of birth',new Intl.DateTimeFormat('en-GB').format(student.dateOfBirth)],
    ['Guardian',student.guardianName,'Guardian mobile',student.guardianPhone],
    ['Class teacher',student.class?.teacher ? `${student.class.teacher.firstName} ${student.class.teacher.lastName}` : 'Not assigned','Reporting period',term || student.results[0].exam.term || 'All published assessments'],
  ];
  for(const row of studentRows){text(row[0],margin,y,8,bold,grey);text(row[1],margin+88,y,9,bold);text(row[2],315,y,8,bold,grey);text(row[3],405,y,9,bold);y-=22;}
  y-=4;text('ACADEMIC PERFORMANCE',margin,y,10,bold,blue);y-=13;rule(y);y-=23;
  const columns=[margin,190,286,342,397,451,505];const headers=['Subject','Assessment','Component','Max','Pass','Obtained','Grade'];
  page.drawRectangle({x:margin,y:y-5,width:pageSize[0]-margin*2,height:21,color:rgb(.93,.96,1)});
  headers.forEach((header,index)=>text(header,columns[index],y+2,index<3?7.5:7,bold,navy));y-=23;
  let earned=0,total=0;let allPassed=true;
  for(const result of student.results){
    if(y<185){page=pdf.addPage(pageSize);y=790;text('ACADEMIC PERFORMANCE (CONTINUED)',margin,y,10,bold,blue);y-=18;rule(y);y-=22;}
    const marks=Number(result.marks);earned+=marks;total+=result.exam.totalMarks;const passed=marks>=result.exam.passingMarks;allPassed&&=passed;
    const percentage=result.exam.totalMarks?marks/result.exam.totalMarks*100:0;
    const grade=result.grade || (percentage>=91?'A1':percentage>=81?'A2':percentage>=71?'B1':percentage>=61?'B2':percentage>=51?'C1':percentage>=41?'C2':percentage>=33?'D':'E');
    const values=[result.exam.subject,result.exam.name.slice(0,15),result.exam.componentType.replaceAll('_',' '),String(result.exam.totalMarks),String(result.exam.passingMarks),String(marks),grade];
    values.forEach((value,index)=>text(value,columns[index],y,index<3?7.5:8,index===5||index===6?bold:regular,index===5&&!passed?red:navy));y-=19;rule(y+7,.5);
  }
  y-=8;const percentage=total?Math.round(earned/total*10000)/100:0;
  page.drawRectangle({x:margin,y:y-42,width:pageSize[0]-margin*2,height:48,color:rgb(.96,.98,1),borderColor:line,borderWidth:1});
  text('TOTAL',margin+12,y-10,9,bold);text(`${earned} / ${total}`,150,y-10,13,bold,blue);text('PERCENTAGE',285,y-10,9,bold);text(`${percentage}%`,380,y-10,13,bold,blue);text(allPassed?'PASS':'NEEDS IMPROVEMENT',465,y-10,9,bold,allPassed?green:red);y-=65;
  const present=attendance.filter(item=>item.status==='PRESENT'||item.status==='LATE').length;
  const attendancePercent=attendance.length?Math.round(present/attendance.length*1000)/10:0;
  text('ATTENDANCE & DEVELOPMENT',margin,y,10,bold,blue);y-=13;rule(y);y-=22;
  text('Working days recorded',margin,y,8,bold,grey);text(String(attendance.length),150,y,10,bold);text('Days attended',250,y,8,bold,grey);text(String(present),340,y,10,bold);text('Attendance',420,y,8,bold,grey);text(`${attendancePercent}%`,492,y,10,bold);y-=28;
  text('Teacher remarks',margin,y,8,bold,grey);y-=15;
  const remarks=[...new Set(student.results.map(item=>item.feedback).filter(Boolean))].join(' | ') || (allPassed?'Satisfactory academic progress. Continue the good work.':'Focused support and regular revision are recommended.');
  const remarkLines=remarks.match(/.{1,88}(?:\s|$)/g)?.slice(0,3) ?? [remarks];
  remarkLines.forEach(value=>{text(value.trim(),margin,y,8.5,regular,navy);y-=13;});y-=18;
  rule(y);y-=52;
  text('Class Teacher',margin+18,y,8,bold,grey);text('Parent / Guardian',235,y,8,bold,grey);text('Principal / Head of School',420,y,8,bold,grey);
  y-=60;rule(y);y-=15;text(`Generated on ${new Intl.DateTimeFormat('en-IN',{dateStyle:'long'}).format(new Date())} · This is a computer-generated academic record.`,margin,y,7.5,regular,grey);
  const bytes = await pdf.save();
  const safeName=`${student.admissionNo}-${resolvedYear}${term?`-${term}`:''}-report-card`.replace(/[^a-zA-Z0-9-]+/g,'-');
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${safeName}.pdf"`);res.send(Buffer.from(bytes));
});

resourceRouter.post('/exam-plans', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = examPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const seriesCode = `EX-${parsed.data.academicYear.replace('-', '')}-${Date.now().toString(36).toUpperCase()}`;
  const result = await getDb().$transaction(async tx => {
    const schoolClass = await tx.schoolClass.findUnique({ where: { id: parsed.data.classId } });
    if (!schoolClass) throw new Error('Class not found');
    const papers = [];
    for (const paper of parsed.data.papers) {
      if (paper.passingMarks > paper.totalMarks) throw new Error('Passing marks cannot exceed total marks');
      papers.push(await tx.exam.create({ data: { ...paper, name: parsed.data.name, seriesCode, academicYear: parsed.data.academicYear, examType: parsed.data.examType, term: parsed.data.term, classId: parsed.data.classId, status: 'SCHEDULED' } }));
    }
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'CREATE_EXAM_PLAN', entityType: 'ExamPlan', entityId: seriesCode, metadata: { name: parsed.data.name, classId: parsed.data.classId, className: classDisplayName(schoolClass), academicYear: parsed.data.academicYear, examType: parsed.data.examType, papers: papers.length } } });
    return papers;
  }, { timeout: 30_000 });
  res.status(201).json({ seriesCode, papers: result });
});

resourceRouter.put('/exams/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = examPaperSchema.partial().extend({ status: z.enum(['DRAFT','SCHEDULED','MARKS_IN_PROGRESS','READY']).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (parsed.data.totalMarks && parsed.data.passingMarks && parsed.data.passingMarks > parsed.data.totalMarks) return res.status(400).json({ message: 'Passing marks cannot exceed total marks.' });
  const item = await getDb().exam.update({ where: { id: String(req.params.id) }, data: parsed.data });
  await getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'UPDATE_EXAM', entityType: 'Exam', entityId: item.id, metadata: parsed.data } });
  res.json(item);
});

resourceRouter.get('/exams/:id/roster', authorize('ADMIN', 'TEACHER'), async (req: AuthRequest, res) => {
  const exam = await getDb().exam.findUnique({ where: { id: String(req.params.id) }, include: { class: { include: { students: { orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], include: { results: { where: { examId: String(req.params.id) } }, attendance: { select: { status: true } } } } } }, teacher: true } });
  if (!exam) return res.status(404).json({ message: 'Exam paper not found.' });
  if (req.user!.role === 'TEACHER' && !(await teacherCanAccessClass(req.user!.id, exam.classId)) && exam.teacher?.userId !== req.user!.id) return res.status(403).json({ message: 'This paper is not assigned to you.' });
  res.json({ ...exam, students: exam.class.students.map(student => {
    const counted = student.attendance.filter(record => ['PRESENT', 'ABSENT', 'LATE'].includes(record.status));
    const attended = counted.filter(record => record.status === 'PRESENT' || record.status === 'LATE').length;
    return { id: student.id, admissionNo: student.admissionNo, firstName: student.firstName, lastName: student.lastName, attendancePercent: counted.length ? Math.round(attended / counted.length * 1000) / 10 : null, result: student.results[0] ?? null };
  }) });
});

resourceRouter.post('/exams/:id/results', authorize('ADMIN', 'TEACHER'), async (req: AuthRequest, res) => {
  const parsed = z.object({ results: z.array(z.object({ studentId: z.string(), marks: z.coerce.number().min(0), grade: z.string().max(10).optional(), feedback: z.string().max(500).optional() })).min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const exam = await getDb().exam.findUnique({ where: { id: String(req.params.id) }, include: { teacher: true, class: { select: { students: { select: { id: true } } } } } });
  if (!exam) return res.status(404).json({ message: 'Exam paper not found.' });
  if (req.user!.role === 'TEACHER' && !(await teacherCanAccessClass(req.user!.id, exam.classId)) && exam.teacher?.userId !== req.user!.id) return res.status(403).json({ message: 'This paper is not assigned to you.' });
  const valid = new Set(exam.class.students.map(student => student.id));
  if (parsed.data.results.some(result => !valid.has(result.studentId) || result.marks > exam.totalMarks)) return res.status(400).json({ message: `Marks must be between 0 and ${exam.totalMarks}, and students must belong to this class.` });
  await getDb().$transaction(async tx => {
    for (const result of parsed.data.results) await tx.examResult.upsert({ where: { examId_studentId: { examId: exam.id, studentId: result.studentId } }, create: { examId: exam.id, ...result }, update: result });
    const resultCount = await tx.examResult.count({ where: { examId: exam.id } });
    await tx.exam.update({ where: { id: exam.id }, data: { status: resultCount === valid.size ? 'READY' : 'MARKS_IN_PROGRESS' } });
    await tx.auditLog.create({ data: { actorId: req.user!.id, action: 'SAVE_EXAM_RESULTS', entityType: 'Exam', entityId: exam.id, metadata: { saved: parsed.data.results.length, completed: resultCount, students: valid.size } } });
  }, { timeout: 30_000 });
  res.status(201).json({ saved: parsed.data.results.length });
});

resourceRouter.post('/exam-plans/:seriesCode/publish', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const seriesCode = String(req.params.seriesCode);
  let planWhere: { seriesCode?: string; id?: string } = { seriesCode };
  let papers = await getDb().exam.findMany({ where: planWhere, include: { class: { select: { _count: { select: { students: true } } } }, _count: { select: { results: true } } } });
  if (!papers.length) {
    planWhere = { id: seriesCode };
    papers = await getDb().exam.findMany({ where: planWhere, include: { class: { select: { _count: { select: { students: true } } } }, _count: { select: { results: true } } } });
  }
  if (!papers.length) return res.status(404).json({ message: 'Exam plan not found.' });
  const incomplete = papers.filter(paper => paper._count.results < paper.class._count.students);
  if (incomplete.length) return res.status(400).json({ message: `${incomplete.length} paper${incomplete.length === 1 ? '' : 's'} still have incomplete marks.` });
  const publishedAt = new Date();
  await getDb().$transaction([getDb().exam.updateMany({ where: planWhere, data: { status: 'PUBLISHED', publishedAt } }), getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'PUBLISH_EXAM_RESULTS', entityType: 'ExamPlan', entityId: seriesCode, metadata: { papers: papers.length, publishedAt: publishedAt.toISOString() } } })]);
  res.json({ published: papers.length, publishedAt });
});

resourceRouter.get('/timetable/context', authorize('ADMIN'), async (_req, res) => {
  const [classes, teachers, rooms] = await Promise.all([
    getDb().schoolClass.findMany({ include: { room: true }, orderBy: [{ name: 'asc' }, { section: 'asc' }] }),
    getDb().teacher.findMany({ orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
    getDb().room.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  res.json({ classes, teachers, rooms });
});

resourceRouter.get('/timetable', authorize('ADMIN','TEACHER','PARENT','STUDENT'), async (req: AuthRequest, res) => {
  const classId = String(req.query.classId ?? ''); const teacherId = String(req.query.teacherId ?? '');
  const roleWhere = req.user!.role === 'ADMIN' ? {} : req.user!.role === 'TEACHER'
    ? { teacher: { userId: req.user!.id } }
    : req.user!.role === 'STUDENT'
      ? { class: { students: { some: { userId: req.user!.id } } } }
      : { class: { students: { some: { parents: { some: { parent: { userId: req.user!.id } } } } } } };
  const entries = await getDb().timetableEntry.findMany({ where: { ...roleWhere, ...(classId ? { classId } : {}), ...(teacherId ? { teacherId } : {}) }, include: { class: true, teacher: true, room: true }, orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }] });
  const conflicts = req.user!.role === 'ADMIN' ? entries.flatMap((entry,index) => entries.slice(index+1).filter(other => entry.dayOfWeek === other.dayOfWeek && entry.period === other.period && ((entry.teacherId && entry.teacherId === other.teacherId) || (entry.roomId && entry.roomId === other.roomId))).map(other => ({ entryId: entry.id, otherId: other.id, dayOfWeek: entry.dayOfWeek, period: entry.period, type: entry.teacherId === other.teacherId ? 'TEACHER' : 'ROOM', message: entry.teacherId === other.teacherId ? `${entry.teacherName} is assigned to two classes.` : `${entry.room?.name ?? 'Room'} is double-booked.` }))) : [];
  res.json({ entries, conflicts });
});

resourceRouter.post('/timetable', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = timetableSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const bookingTargets = [
    { classId: parsed.data.classId },
    { teacherId: parsed.data.teacherId },
    ...(parsed.data.roomId ? [{ roomId: parsed.data.roomId }] : []),
  ];
  const [teacher, clash] = await Promise.all([
    getDb().teacher.findUnique({ where: { id: parsed.data.teacherId } }),
    getDb().timetableEntry.findFirst({
      where: { dayOfWeek: parsed.data.dayOfWeek, period: parsed.data.period, OR: bookingTargets },
      include: { class: true, teacher: true, room: true },
    }),
  ]);
  if (!teacher) return res.status(404).json({ message: 'Teacher not found.' });
  if (clash) return res.status(409).json({ message: `Scheduling conflict with ${classDisplayName(clash.class)} · ${clash.subject}.` });
  const item = await getDb().timetableEntry.create({ data: { ...parsed.data, teacherName: `${teacher.firstName} ${teacher.lastName}` }, include: { class: true, teacher: true, room: true } });
  await getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'CREATE_TIMETABLE_PERIOD', entityType: 'TimetableEntry', entityId: item.id, metadata: parsed.data } }); res.status(201).json(item);
});

resourceRouter.put('/timetable/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = timetableSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const bookingTargets = [
    { classId: parsed.data.classId },
    { teacherId: parsed.data.teacherId },
    ...(parsed.data.roomId ? [{ roomId: parsed.data.roomId }] : []),
  ];
  const [teacher, clash] = await Promise.all([
    getDb().teacher.findUnique({ where: { id: parsed.data.teacherId } }),
    getDb().timetableEntry.findFirst({ where: { id: { not: String(req.params.id) }, dayOfWeek: parsed.data.dayOfWeek, period: parsed.data.period, OR: bookingTargets } }),
  ]);
  if (!teacher) return res.status(404).json({ message: 'Teacher not found.' }); if (clash) return res.status(409).json({ message: 'This class, teacher, or room is already booked for that period.' });
  const item = await getDb().timetableEntry.update({ where: { id: String(req.params.id) }, data: { ...parsed.data, teacherName: `${teacher.firstName} ${teacher.lastName}` }, include: { class: true, teacher: true, room: true } });
  await getDb().auditLog.create({ data: { actorId: req.user!.id, action: 'UPDATE_TIMETABLE_PERIOD', entityType: 'TimetableEntry', entityId: item.id, metadata: parsed.data } }); res.json(item);
});

resourceRouter.delete('/timetable/:id', authorize('ADMIN'), async (req: AuthRequest, res) => { const id=String(req.params.id); await getDb().$transaction([getDb().auditLog.create({ data: { actorId:req.user!.id,action:'DELETE_TIMETABLE_PERIOD',entityType:'TimetableEntry',entityId:id } }),getDb().timetableEntry.delete({where:{id}})]);res.status(204).send(); });

resourceRouter.get('/teacher-attendance', authorize('ADMIN','TEACHER'), async (req: AuthRequest, res) => {
  const parsed=attendanceDateSchema.safeParse(String(req.query.date??todayInSchoolTimezone()));if(!parsed.success)return res.status(400).json({message:'Date must use YYYY-MM-DD format.'});const date=attendanceDate(parsed.data);
  const teachers=await getDb().teacher.findMany({where:req.user!.role==='TEACHER'?{userId:req.user!.id}:{},include:{attendanceRecords:{where:{date}}},orderBy:[{firstName:'asc'},{lastName:'asc'}]});
  res.json({date:parsed.data,teachers:teachers.map(({attendanceRecords,...teacher})=>({...teacher,attendance:attendanceRecords[0]??null})),summary:{present:teachers.filter(t=>t.attendanceRecords[0]?.status==='PRESENT').length,absent:teachers.filter(t=>t.attendanceRecords[0]?.status==='ABSENT').length,onLeave:teachers.filter(t=>t.attendanceRecords[0]?.status==='ON_LEAVE').length,unmarked:teachers.filter(t=>!t.attendanceRecords.length).length}});
});

resourceRouter.post('/teacher-attendance/bulk', authorize('ADMIN'), async (req: AuthRequest,res)=>{
  const parsed=z.object({date:attendanceDateSchema,records:z.array(z.object({teacherId:z.string(),status:teacherAttendanceStatus,checkIn:z.string().optional(),checkOut:z.string().optional(),note:z.string().max(300).optional()})).min(1).max(300)}).safeParse(req.body);if(!parsed.success)return res.status(400).json(parsed.error.flatten());const date=attendanceDate(parsed.data.date);
  await getDb().$transaction(async tx=>{for(const record of parsed.data.records){const item=await tx.teacherAttendance.upsert({where:{teacherId_date:{teacherId:record.teacherId,date}},create:{...record,date,markedById:req.user!.id},update:{...record,markedById:req.user!.id,markedAt:new Date()}});await tx.auditLog.create({data:{actorId:req.user!.id,action:'MARK_TEACHER_ATTENDANCE',entityType:'TeacherAttendance',entityId:item.id,metadata:{teacherId:record.teacherId,date:parsed.data.date,status:record.status}}});}},{timeout:30_000});res.status(201).json({saved:parsed.data.records.length});
});

resourceRouter.get('/teacher-leave',authorize('ADMIN','TEACHER'),async(req:AuthRequest,res)=>res.json(await getDb().teacherLeaveRequest.findMany({where:req.user!.role==='TEACHER'?{teacher:{userId:req.user!.id}}:{},include:{teacher:true},orderBy:{createdAt:'desc'}})));
resourceRouter.post('/teacher-leave',authorize('ADMIN','TEACHER'),async(req:AuthRequest,res)=>{const parsed=z.object({teacherId:z.string().optional(),startDate:z.coerce.date(),endDate:z.coerce.date(),type:z.string().min(2).max(50),reason:z.string().min(2).max(500)}).safeParse(req.body);if(!parsed.success)return res.status(400).json(parsed.error.flatten());if(parsed.data.endDate<parsed.data.startDate)return res.status(400).json({message:'End date cannot be before start date.'});const teacher=req.user!.role==='TEACHER'?await getDb().teacher.findUnique({where:{userId:req.user!.id}}):parsed.data.teacherId?await getDb().teacher.findUnique({where:{id:parsed.data.teacherId}}):null;if(!teacher)return res.status(404).json({message:'Teacher profile not found.'});const item=await getDb().teacherLeaveRequest.create({data:{teacherId:teacher.id,startDate:parsed.data.startDate,endDate:parsed.data.endDate,type:parsed.data.type,reason:parsed.data.reason}});await getDb().auditLog.create({data:{actorId:req.user!.id,action:'REQUEST_TEACHER_LEAVE',entityType:'TeacherLeaveRequest',entityId:item.id,metadata:{teacherId:teacher.id}}});res.status(201).json(item);});
resourceRouter.patch('/teacher-leave/:id',authorize('ADMIN'),async(req:AuthRequest,res)=>{const parsed=z.object({status:z.enum(['APPROVED','REJECTED']),reviewNote:z.string().max(500).optional()}).safeParse(req.body);if(!parsed.success)return res.status(400).json(parsed.error.flatten());const item=await getDb().teacherLeaveRequest.update({where:{id:String(req.params.id)},data:{...parsed.data,reviewedById:req.user!.id}});await getDb().auditLog.create({data:{actorId:req.user!.id,action:`${parsed.data.status}_TEACHER_LEAVE`,entityType:'TeacherLeaveRequest',entityId:item.id,metadata:{reviewNote:parsed.data.reviewNote}}});res.json(item);});
resourceRouter.get('/attendance/classes', authorize('ADMIN', 'TEACHER'), async (req: AuthRequest, res) => {
  const parsed = attendanceDateSchema.safeParse(String(req.query.date ?? todayInSchoolTimezone()));
  if (!parsed.success) return res.status(400).json({ message: 'Date must use YYYY-MM-DD format.' });
  const date = attendanceDate(parsed.data);
  const classes = await getDb().schoolClass.findMany({
    where: req.user!.role === 'TEACHER' ? { teacher: { userId: req.user!.id } } : {},
    include: {
      room: true, teacher: true, _count: { select: { students: true } },
      students: { select: { attendance: { where: { date }, select: { status: true } } } },
    },
    orderBy: [{ name: 'asc' }, { section: 'asc' }],
  });
  res.json(classes.map(item => {
    const marked = item.students.flatMap(student => student.attendance);
    return { id: item.id, name: item.name, section: item.section, room: item.room, teacher: item.teacher, totalStudents: item._count.students, marked: marked.length, present: marked.filter(record => record.status === 'PRESENT').length, absent: marked.filter(record => record.status === 'ABSENT').length, late: marked.filter(record => record.status === 'LATE').length, excused: marked.filter(record => record.status === 'EXCUSED').length };
  }));
});

resourceRouter.get('/attendance/classes/:id', authorize('ADMIN', 'TEACHER'), async (req: AuthRequest, res) => {
  const classId = String(req.params.id);
  if (req.user!.role === 'TEACHER' && !(await teacherCanAccessClass(req.user!.id, classId))) return res.status(403).json({ message: 'This class is not assigned to you.' });
  const parsed = attendanceDateSchema.safeParse(String(req.query.date ?? todayInSchoolTimezone()));
  if (!parsed.success) return res.status(400).json({ message: 'Date must use YYYY-MM-DD format.' });
  const date = attendanceDate(parsed.data);
  const item = await getDb().schoolClass.findUnique({
    where: { id: classId },
    include: { teacher: true, room: true, students: { orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], include: { attendance: { where: { date } } } } },
  });
  if (!item) return res.status(404).json({ message: 'Class not found.' });
  res.json({ id: item.id, name: item.name, section: item.section, teacher: item.teacher, room: item.room, date: parsed.data, editable: req.user!.role === 'ADMIN' || parsed.data === todayInSchoolTimezone(), students: item.students.map(student => ({ id: student.id, admissionNo: student.admissionNo, firstName: student.firstName, lastName: student.lastName, attendance: student.attendance[0] ?? null })) });
});

resourceRouter.post('/attendance/bulk', authorize('ADMIN', 'TEACHER'), async (req: AuthRequest, res) => {
  const parsed = z.object({
    classId: z.string().min(1), date: attendanceDateSchema,
    records: z.array(z.object({ studentId: z.string().min(1), status: z.enum(['PRESENT','ABSENT','LATE','EXCUSED']), note: z.string().max(300).optional() })).min(1).max(200),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (parsed.data.date > todayInSchoolTimezone()) return res.status(400).json({ message: 'Attendance cannot be marked for a future date.' });
  if (req.user!.role === 'TEACHER') {
    if (parsed.data.date !== todayInSchoolTimezone()) return res.status(403).json({ message: 'Teachers can only mark attendance for the current school date.' });
    if (!(await teacherCanAccessClass(req.user!.id, parsed.data.classId))) return res.status(403).json({ message: 'This class is not assigned to you.' });
  }
  const validStudents = await getDb().student.findMany({ where: { id: { in: parsed.data.records.map(item => item.studentId) }, classId: parsed.data.classId }, select: { id: true } });
  if (validStudents.length !== new Set(parsed.data.records.map(item => item.studentId)).size) return res.status(400).json({ message: 'One or more students do not belong to this class.' });
  const date = attendanceDate(parsed.data.date);
  const result = await getDb().$transaction(async tx => {
    const saved = [];
    for (const record of parsed.data.records) {
      const previous = await tx.attendance.findUnique({ where: { studentId_date: { studentId: record.studentId, date } } });
      const item = await tx.attendance.upsert({
        where: { studentId_date: { studentId: record.studentId, date } },
        create: { studentId: record.studentId, date, status: record.status, note: record.note, markedById: req.user!.id },
        update: { status: record.status, note: record.note, markedById: req.user!.id, markedAt: new Date() },
      });
      await tx.auditLog.create({ data: { actorId: req.user!.id, action: previous ? 'UPDATE_ATTENDANCE' : 'MARK_ATTENDANCE', entityType: 'Attendance', entityId: item.id, ipAddress: req.ip, userAgent: req.headers['user-agent'], metadata: { studentId: record.studentId, classId: parsed.data.classId, date: parsed.data.date, previousStatus: previous?.status ?? null, status: record.status, note: record.note ?? null, markedAt: item.markedAt.toISOString() } } });
      saved.push(item);
    }
    return saved;
  }, { timeout: 30_000 });
  res.status(201).json({ saved: result.length });
});

resourceRouter.get('/dashboard', authorize('ADMIN', 'LIBRARIAN'), async (req: AuthRequest, res) => {
  const db = getDb();
  const todayKey = todayInSchoolTimezone();
  const today = attendanceDate(todayKey);
  const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const scheduleEnd = new Date(today); scheduleEnd.setUTCDate(scheduleEnd.getUTCDate() + 45);

  const eventsPromise = db.academicEvent.findMany({
    where: { startsAt: { gte: today, lte: scheduleEnd }, audience: { has: req.user!.role as 'ADMIN' | 'LIBRARIAN' } },
    orderBy: { startsAt: 'asc' },
    take: 5,
  });

  if (req.user!.role === 'LIBRARIAN') {
    const [catalog, available, issued, overdue, fines, loans, events] = await Promise.all([
      db.book.aggregate({ _sum: { totalCopies: true } }),
      db.book.aggregate({ _sum: { availableCopies: true } }),
      db.bookLoan.count({ where: { status: 'ISSUED' } }),
      db.bookLoan.count({ where: { OR: [{ status: 'OVERDUE' }, { status: 'ISSUED', dueAt: { lt: today } }] } }),
      db.bookLoan.aggregate({ where: { fineAmount: { gt: 0 }, status: { not: 'RETURNED' } }, _sum: { fineAmount: true } }),
      db.bookLoan.findMany({ include: { book: true, student: true }, orderBy: { issuedAt: 'desc' }, take: 6 }),
      eventsPromise,
    ]);
    return res.json({
      role: 'LIBRARIAN',
      metrics: {
        catalog: catalog._sum.totalCopies ?? 0,
        available: available._sum.availableCopies ?? 0,
        issued,
        overdue,
        fines: Number(fines._sum.fineAmount ?? 0),
      },
      loans,
      events,
    });
  }

  const attendanceStart = new Date(today); attendanceStart.setUTCDate(attendanceStart.getUTCDate() - 6);
  const [students, teachers, employees, classes, todayAttendance, monthPayments, attendanceRecords, recentStudents, events] = await Promise.all([
    db.student.count(),
    db.teacher.count(),
    db.employee.count({ where: { isActive: true } }),
    db.schoolClass.count(),
    db.attendance.groupBy({ by: ['status'], where: { date: today }, _count: { _all: true } }),
    db.feePayment.aggregate({ where: { paidAt: { gte: monthStart, lt: nextMonth } }, _sum: { amount: true }, _count: { _all: true } }),
    db.attendance.findMany({ where: { date: { gte: attendanceStart, lte: today } }, select: { date: true, status: true } }),
    db.student.findMany({ include: { class: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
    eventsPromise,
  ]);
  const todayMarked = todayAttendance.reduce((sum, item) => sum + item._count._all, 0);
  const todayPresent = todayAttendance.reduce((sum, item) => sum + (item.status === 'PRESENT' || item.status === 'LATE' ? item._count._all : 0), 0);
  const attendance = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(attendanceStart); date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const records = attendanceRecords.filter(record => record.date.toISOString().slice(0, 10) === key);
    const present = records.filter(record => record.status === 'PRESENT' || record.status === 'LATE').length;
    return { date: key, value: records.length ? Math.round(present / records.length * 1000) / 10 : null, marked: records.length };
  });
  res.json({
    role: 'ADMIN',
    metrics: {
      students,
      staff: teachers + employees,
      teachers,
      classes,
      attendance: todayMarked ? Math.round(todayPresent / todayMarked * 1000) / 10 : 0,
      attendanceMarked: todayMarked,
      feesCollected: Number(monthPayments._sum.amount ?? 0),
      feeTransactions: monthPayments._count._all,
    },
    attendance,
    recentStudents,
    events,
  });
});
