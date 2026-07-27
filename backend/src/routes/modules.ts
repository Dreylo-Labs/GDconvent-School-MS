import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { authorize, type AuthRequest } from '../middleware/auth.js';
import type { Prisma } from '@prisma/client';
import { Role } from '@prisma/client';

export const modulesRouter = Router();
const db = getDb;
async function audit(req: AuthRequest, action: string, entityType: string, entityId?: string, metadata?: object) {
  await db().auditLog.create({ data: { actorId: req.user?.id, action, entityType, entityId, metadata, ipAddress: req.ip, userAgent: req.headers['user-agent'] } });
}

modulesRouter.get('/overview', async (req: AuthRequest, res) => {
  const role = req.user!.role;
  if (role === 'ADMIN') {
    const [students, employees, applications, pendingLeaves, overdueFees] = await Promise.all([db().student.count(), db().employee.count({ where: { isActive: true } }), db().admissionApplication.count(), db().staffLeaveRequest.count({ where: { status: 'PENDING' } }), db().fee.count({ where: { status: 'OVERDUE' } })]);
    return res.json({ role, metrics: { students, employees, applications, pendingLeaves, overdueFees } });
  }
  if (role === 'LIBRARIAN') {
    const [books, issued, overdue] = await Promise.all([db().book.aggregate({ _sum: { totalCopies: true } }), db().bookLoan.count({ where: { status: 'ISSUED' } }), db().bookLoan.count({ where: { status: 'OVERDUE' } })]);
    return res.json({ role, metrics: { books: books._sum.totalCopies ?? 0, issued, overdue } });
  }
  return res.json({ role, metrics: {} });
});

modulesRouter.get('/search', async (req: AuthRequest, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json([]);
  const role = req.user!.role;
  const results: { id: string; type: string; title: string; subtitle: string; href: string }[] = [];
  if (role === 'ADMIN' || role === 'TEACHER' || role === 'ACCOUNTANT') {
    const studentWhere: Prisma.StudentWhereInput = {
      ...(role === 'TEACHER' ? { class: { teacher: { userId: req.user!.id } } } : {}),
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { admissionNo: { contains: q, mode: 'insensitive' } },
        { guardianName: { contains: q, mode: 'insensitive' } },
      ],
    };
    const students = await db().student.findMany({ where: studentWhere, include: { class: true }, take: 6, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] });
    results.push(...students.map(student => ({
      id: student.id,
      type: role === 'ACCOUNTANT' ? 'Student account' : 'Student',
      title: `${student.firstName} ${student.lastName}`,
      subtitle: `${student.admissionNo}${student.class ? ` · ${student.class.name}${student.class.section ? `-${student.class.section}` : ''}` : ''}`,
      href: role === 'ACCOUNTANT' ? `/fees/students/${student.id}` : `/students/${student.id}`,
    })));
  }
  if (role === 'PARENT') {
    const children = await db().student.findMany({
      where: {
        parents: { some: { parent: { userId: req.user!.id } } },
        OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { admissionNo: { contains: q, mode: 'insensitive' } }],
      },
      include: { class: true },
      take: 8,
    });
    results.push(...children.map(student => ({
      id: student.id,
      type: 'Linked child',
      title: `${student.firstName} ${student.lastName}`,
      subtitle: `${student.admissionNo}${student.class ? ` · ${student.class.name}${student.class.section ? `-${student.class.section}` : ''}` : ''}`,
      href: '/',
    })));
  }
  if (role === 'ADMIN') {
    const [teachers, classes] = await Promise.all([
      db().teacher.findMany({ where: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { employeeNo: { contains: q, mode: 'insensitive' } }] }, take: 4 }),
      db().schoolClass.findMany({ where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { section: { contains: q, mode: 'insensitive' } }] }, take: 4 }),
    ]);
    results.push(...teachers.map(teacher => ({ id: teacher.id, type: 'Teacher', title: `${teacher.firstName} ${teacher.lastName}`, subtitle: `${teacher.employeeNo} · ${teacher.subject ?? 'Subject not assigned'}`, href: '/teachers' })));
    results.push(...classes.map(item => ({ id: item.id, type: 'Class', title: `${item.name}${item.section ? `-${item.section}` : ''}`, subtitle: 'Class and section', href: '/classes' })));
  }
  if (role === 'LIBRARIAN' || role === 'STUDENT') {
    const books = await db().book.findMany({ where: { OR: [{ title: { contains: q, mode: 'insensitive' } }, { author: { contains: q, mode: 'insensitive' } }, { isbn: { contains: q } }] }, take: 8, orderBy: { title: 'asc' } });
    results.push(...books.map(book => ({ id: book.id, type: 'Library', title: book.title, subtitle: `${book.author} · ${book.availableCopies}/${book.totalCopies} available`, href: '/modules/library' })));
  }
  res.json(results.slice(0, 10));
});

modulesRouter.get('/admissions', authorize('ADMIN'), async (_req, res) => res.json(await db().admissionApplication.findMany({ orderBy: { createdAt: 'desc' } })));
modulesRouter.post('/admissions', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = z.object({ studentName: z.string().min(2), dateOfBirth: z.coerce.date(), gender: z.enum(['MALE','FEMALE','OTHER']), applyingForClass: z.string().min(1), parentName: z.string().min(2), parentEmail: z.string().email(), parentPhone: z.string().min(8), source: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const count = await db().admissionApplication.count();
  const item = await db().admissionApplication.create({ data: { ...parsed.data, applicationNo: `APP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}` } });
  await audit(req, 'CREATE', 'AdmissionApplication', item.id); return res.status(201).json(item);
});
modulesRouter.patch('/admissions/:id/status', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(['INQUIRY','APPLIED','ASSESSMENT','REVIEW','ADMITTED','WAITLISTED','REJECTED']), reviewerNote: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const item = await db().admissionApplication.update({ where: { id: String(req.params.id) }, data: parsed.data });
  await audit(req, 'STATUS_CHANGE', 'AdmissionApplication', item.id, { status: item.status }); return res.json(item);
});

modulesRouter.get('/employees', authorize('ADMIN'), async (_req, res) => res.json(await db().employee.findMany({ include: { leaveRequests: { where: { status: 'PENDING' } } }, orderBy: { firstName: 'asc' } })));
modulesRouter.post('/employees', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = z.object({ employeeNo: z.string().min(2), firstName: z.string().min(1), lastName: z.string().min(1), email: z.string().email().optional(), phone: z.string().optional(), jobTitle: z.string().min(2), department: z.string().min(2), joinedAt: z.coerce.date(), baseSalary: z.coerce.number().nonnegative().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const item = await db().employee.create({ data: parsed.data }); await audit(req, 'CREATE', 'Employee', item.id); return res.status(201).json(item);
});
modulesRouter.get('/leave', authorize('ADMIN','TEACHER'), async (req: AuthRequest, res) => res.json(await db().staffLeaveRequest.findMany({ where: req.user!.role === 'ADMIN' ? {} : { employee: { userId: req.user!.id } }, include: { employee: true }, orderBy: { createdAt: 'desc' } })));

const studentLeaveIssues = ['FEVER','HEADACHE','COLD_AND_COUGH','STOMACH_PAIN','VOMITING','DIARRHOEA','BACK_PAIN','TOOTHACHE','EYE_INFECTION','EAR_PAIN','SKIN_ALLERGY','MINOR_INJURY','DOCTOR_APPOINTMENT','FAMILY_EMERGENCY','RELIGIOUS_FUNCTION','OUT_OF_STATION','OTHER'] as const;
const studentLeavePayload = z.object({
  studentId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  issue: z.enum(studentLeaveIssues),
  details: z.string().trim().max(500).optional(),
});
const unpackStudentLeave = (reason: string) => {
  try { return JSON.parse(reason) as { issue: string; details?: string }; }
  catch { return { issue: 'OTHER', details: reason }; }
};
modulesRouter.get('/student-leave/context', authorize('PARENT'), async (req: AuthRequest, res) => {
  const children = await db().student.findMany({
    where: { parents: { some: { parent: { userId: req.user!.id } } } },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, class: { select: { name: true, section: true } } },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  res.json({ children, issues: studentLeaveIssues });
});
modulesRouter.get('/student-leave', authorize('ADMIN','TEACHER','PARENT'), async (req: AuthRequest, res) => {
  const role = req.user!.role;
  const where: Prisma.StudentLeaveRequestWhereInput = role === 'PARENT'
    ? { student: { parents: { some: { parent: { userId: req.user!.id } } } } }
    : role === 'TEACHER' ? { student: { class: { teacher: { userId: req.user!.id } } } } : {};
  const items = await db().studentLeaveRequest.findMany({ where, include: { student: { include: { class: true } } }, orderBy: [{ createdAt: 'desc' }] });
  res.json(items.map(item => ({ ...item, ...unpackStudentLeave(item.reason), reason: undefined })));
});
modulesRouter.post('/student-leave', authorize('PARENT'), async (req: AuthRequest, res) => {
  const parsed = studentLeavePayload.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Choose a child, valid dates, and a leave reason.' });
  if (parsed.data.endDate < parsed.data.startDate) return res.status(400).json({ message: 'The end date cannot be before the start date.' });
  const today = new Date(); today.setUTCHours(0,0,0,0);
  if (parsed.data.startDate < today) return res.status(400).json({ message: 'Parents cannot submit a leave request for a past date.' });
  const student = await db().student.findFirst({ where: { id: parsed.data.studentId, parents: { some: { parent: { userId: req.user!.id } } } }, include: { class: true } });
  if (!student) return res.status(403).json({ message: 'This student is not linked to your guardian account.' });
  const overlap = await db().studentLeaveRequest.findFirst({ where: { studentId: student.id, status: { in: ['PENDING','APPROVED'] }, startDate: { lte: parsed.data.endDate }, endDate: { gte: parsed.data.startDate } } });
  if (overlap) return res.status(409).json({ message: 'A pending or approved leave request already covers these dates.' });
  const item = await db().studentLeaveRequest.create({ data: { studentId: student.id, requestedById: req.user!.id, startDate: parsed.data.startDate, endDate: parsed.data.endDate, reason: JSON.stringify({ issue: parsed.data.issue, details: parsed.data.details || undefined }) } });
  await audit(req, 'REQUEST_STUDENT_LEAVE', 'StudentLeaveRequest', item.id, { studentId: student.id, classId: student.classId, issue: parsed.data.issue, startDate: item.startDate, endDate: item.endDate });
  res.status(201).json(item);
});
modulesRouter.patch('/student-leave/:id/review', authorize('ADMIN','TEACHER'), async (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(['APPROVED','REJECTED']), reviewNote: z.string().trim().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Choose approve or reject.' });
  const where = req.user!.role === 'TEACHER' ? { id: String(req.params.id), student: { class: { teacher: { userId: req.user!.id } } } } : { id: String(req.params.id) };
  const existing = await db().studentLeaveRequest.findFirst({ where });
  if (!existing) return res.status(404).json({ message: 'Leave request not found or not assigned to you.' });
  if (existing.status !== 'PENDING') return res.status(409).json({ message: 'Only pending requests can be reviewed.' });
  const item = await db().studentLeaveRequest.update({ where: { id: existing.id }, data: { status: parsed.data.status, reviewNote: parsed.data.reviewNote, reviewedById: req.user!.id } });
  await audit(req, `${parsed.data.status}_STUDENT_LEAVE`, 'StudentLeaveRequest', item.id, { studentId: item.studentId, reviewNote: item.reviewNote });
  res.json(item);
});
modulesRouter.patch('/student-leave/:id/cancel', authorize('PARENT'), async (req: AuthRequest, res) => {
  const existing = await db().studentLeaveRequest.findFirst({ where: { id: String(req.params.id), status: 'PENDING', student: { parents: { some: { parent: { userId: req.user!.id } } } } } });
  if (!existing) return res.status(404).json({ message: 'Pending leave request not found.' });
  const item = await db().studentLeaveRequest.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
  await audit(req, 'CANCEL_STUDENT_LEAVE', 'StudentLeaveRequest', item.id, { studentId: item.studentId });
  res.json(item);
});

modulesRouter.get('/assignments', authorize('ADMIN','TEACHER','STUDENT','PARENT'), async (req: AuthRequest, res) => {
  const role = req.user!.role;
  const where = role === 'TEACHER' ? { teacher: { userId: req.user!.id } } : role === 'STUDENT' ? { class: { students: { some: { userId: req.user!.id } } } } : role === 'PARENT' ? { class: { students: { some: { parents: { some: { parent: { userId: req.user!.id } } } } } } } : {};
  res.json(await db().assignment.findMany({ where, include: { class: true, teacher: true, _count: { select: { submissions: true } } }, orderBy: { dueAt: 'asc' } }));
});
modulesRouter.post('/assignments', authorize('ADMIN','TEACHER'), async (req: AuthRequest, res) => {
  const parsed = z.object({ teacherId: z.string(), classId: z.string(), title: z.string().min(2), description: z.string().min(2), subject: z.string().min(1), dueAt: z.coerce.date(), totalMarks: z.coerce.number().positive().optional(), attachmentUrl: z.string().url().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const item = await db().assignment.create({ data: { ...parsed.data, publishedAt: new Date() } }); await audit(req, 'CREATE', 'Assignment', item.id); return res.status(201).json(item);
});
modulesRouter.get('/lessons', authorize('ADMIN','TEACHER','STUDENT'), async (req: AuthRequest, res) => res.json(await db().lessonPlan.findMany({ where: req.user!.role === 'TEACHER' ? { teacher: { userId: req.user!.id } } : {}, include: { class: true, teacher: true }, orderBy: { scheduledFor: 'desc' } })));

modulesRouter.get('/finance/expenses', authorize('ADMIN','ACCOUNTANT'), async (_req, res) => res.json(await db().expense.findMany({ include: { vendor: true }, orderBy: { incurredAt: 'desc' } })));
modulesRouter.post('/finance/expenses', authorize('ADMIN','ACCOUNTANT'), async (req: AuthRequest, res) => {
  const parsed = z.object({ category: z.string().min(2), description: z.string().min(2), amount: z.coerce.number().positive(), vendorId: z.string().optional(), incurredAt: z.coerce.date(), paymentMethod: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const count = await db().expense.count(); const item = await db().expense.create({ data: { ...parsed.data, expenseNo: `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}` } });
  await audit(req, 'CREATE', 'Expense', item.id); return res.status(201).json(item);
});
modulesRouter.get('/payroll', authorize('ADMIN','ACCOUNTANT'), async (_req, res) => res.json(await db().payrollRun.findMany({ include: { items: { include: { employee: true } } }, orderBy: [{ year: 'desc' }, { month: 'desc' }] })));

modulesRouter.get('/library/books', authorize('ADMIN','LIBRARIAN','STUDENT','TEACHER'), async (req, res) => {
  const q = String(req.query.q ?? ''); res.json(await db().book.findMany({ where: q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { author: { contains: q, mode: 'insensitive' } }, { isbn: { contains: q } }] } : {}, orderBy: { title: 'asc' } }));
});
modulesRouter.post('/library/books', authorize('ADMIN','LIBRARIAN'), async (req: AuthRequest, res) => {
  const parsed = z.object({ isbn: z.string().optional(), title: z.string().min(1), author: z.string().min(1), subject: z.string().optional(), publisher: z.string().optional(), shelf: z.string().optional(), totalCopies: z.coerce.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten()); const item = await db().book.create({ data: { ...parsed.data, availableCopies: parsed.data.totalCopies } }); await audit(req, 'CREATE', 'Book', item.id); return res.status(201).json(item);
});
modulesRouter.get('/library/loans', authorize('ADMIN','LIBRARIAN'), async (_req, res) => res.json(await db().bookLoan.findMany({ include: { book: true, student: true }, orderBy: { issuedAt: 'desc' } })));
modulesRouter.post('/library/loans', authorize('ADMIN','LIBRARIAN'), async (req: AuthRequest, res) => {
  const parsed = z.object({ bookId: z.string(), studentId: z.string().optional(), borrowerUserId: z.string().optional(), dueAt: z.coerce.date() }).safeParse(req.body); if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const item = await db().$transaction(async tx => { const book = await tx.book.findUniqueOrThrow({ where: { id: parsed.data.bookId } }); if (book.availableCopies < 1) throw new Error('No copies available'); await tx.book.update({ where: { id: book.id }, data: { availableCopies: { decrement: 1 } } }); return tx.bookLoan.create({ data: { ...parsed.data, issuedById: req.user!.id } }); });
  await audit(req, 'ISSUE', 'BookLoan', item.id); return res.status(201).json(item);
});

modulesRouter.get('/communications', async (req: AuthRequest, res) => {
  const role=req.user!.role;let classIds:string[]=[];
  if(role==='TEACHER')classIds=(await db().schoolClass.findMany({where:{teacher:{userId:req.user!.id}},select:{id:true}})).map(item=>item.id);
  if(role==='STUDENT')classIds=(await db().student.findMany({where:{userId:req.user!.id,classId:{not:null}},select:{classId:true}})).flatMap(item=>item.classId?[item.classId]:[]);
  if(role==='PARENT')classIds=(await db().student.findMany({where:{parents:{some:{parent:{userId:req.user!.id}}},classId:{not:null}},select:{classId:true}})).flatMap(item=>item.classId?[item.classId]:[]);
  const now=new Date();const announcementWhere:Prisma.AnnouncementWhereInput=role==='ADMIN'?{}:{audience:{has:role as Role},publishedAt:{lte:now},OR:[{expiresAt:null},{expiresAt:{gte:now}}],AND:[{OR:[{targetClassIds:{isEmpty:true}},...(classIds.length?[{targetClassIds:{hasSome:classIds}}]:[])]}]};
  const [announcements,messages]=await Promise.all([
    db().announcement.findMany({where:announcementWhere,include:{reads:{where:{userId:req.user!.id},select:{readAt:true}}},orderBy:[{priority:'desc'},{publishedAt:'desc'},{createdAt:'desc'}]}),
    db().message.findMany({where:{OR:[{senderId:req.user!.id},{recipientId:req.user!.id}]},include:{sender:{select:{id:true,name:true,role:true}},recipient:{select:{id:true,name:true,role:true}}},orderBy:{createdAt:'desc'},take:200}),
  ]);
  res.json({announcements:announcements.map(item=>({...item,isRead:Boolean(item.reads.length),reads:undefined})),messages});
});
modulesRouter.get('/communications/directory', async (req:AuthRequest,res)=>{
  const role=req.user!.role;const allowed=role==='ADMIN'?undefined:role==='TEACHER'?['ADMIN','TEACHER','PARENT']:role==='PARENT'?['ADMIN','TEACHER']:['ADMIN'];
  res.json(await db().user.findMany({where:{id:{not:req.user!.id},isActive:true,...(allowed?{role:{in:allowed as never[]}}:{})},select:{id:true,name:true,role:true},orderBy:{name:'asc'},take:500}));
});
modulesRouter.post('/communications/announcements',authorize('ADMIN'),async(req:AuthRequest,res)=>{
  const parsed=z.object({title:z.string().min(2).max(160),body:z.string().min(2).max(5000),category:z.enum(['CIRCULAR','ANNOUNCEMENT','NOTICE','EVENT','EMERGENCY','ACADEMIC','FEE','HOLIDAY']),audience:z.array(z.enum(['ADMIN','TEACHER','PARENT','STUDENT','ACCOUNTANT','LIBRARIAN'])).min(1),targetClassIds:z.array(z.string()).default([]),priority:z.enum(['LOW','NORMAL','HIGH','URGENT']).default('NORMAL'),attachmentUrl:z.string().url().optional(),publishedAt:z.coerce.date().optional(),expiresAt:z.coerce.date().optional()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json(parsed.error.flatten());const item=await db().announcement.create({data:{...parsed.data,authorId:req.user!.id,publishedAt:parsed.data.publishedAt??new Date()}});await audit(req,'PUBLISH_COMMUNICATION','Announcement',item.id,{category:item.category,audience:item.audience,targetClassIds:item.targetClassIds});res.status(201).json(item);
});
modulesRouter.patch('/communications/announcements/:id/read',async(req:AuthRequest,res)=>{const item=await db().announcementRead.upsert({where:{announcementId_userId:{announcementId:String(req.params.id),userId:req.user!.id}},create:{announcementId:String(req.params.id),userId:req.user!.id},update:{readAt:new Date()}});res.json(item)});
modulesRouter.post('/communications/messages',async(req:AuthRequest,res)=>{const parsed=z.object({recipientId:z.string(),subject:z.string().max(160).optional(),body:z.string().min(1).max(5000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json(parsed.error.flatten());const recipient=await db().user.findFirst({where:{id:parsed.data.recipientId,isActive:true}});if(!recipient)return res.status(404).json({message:'Recipient not found.'});const item=await db().message.create({data:{...parsed.data,senderId:req.user!.id}});await db().notification.create({data:{userId:recipient.id,title:parsed.data.subject||'New message',body:parsed.data.body.slice(0,240),type:'MESSAGE',actionUrl:'/communications'}});await audit(req,'SEND_MESSAGE','Message',item.id,{recipientId:recipient.id});return res.status(201).json(item)});
modulesRouter.patch('/communications/messages/:id/read',async(req:AuthRequest,res)=>{const item=await db().message.updateMany({where:{id:String(req.params.id),recipientId:req.user!.id},data:{readAt:new Date()}});res.json(item)});

const optionalText = (max = 500) => z.preprocess(value => value === '' || value == null ? undefined : value, z.string().trim().max(max).optional());
const timeText = z.preprocess(value => value === '' || value == null ? undefined : value, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional());
const vehicleInput = z.object({
  vehicleNo: z.string().trim().min(2).max(30), registrationNo: z.string().trim().min(4).max(30),
  type: z.enum(['BUS','VAN']), capacity: z.coerce.number().int().min(1).max(100),
  driverName: z.string().trim().min(2).max(100), driverPhone: z.string().trim().min(10).max(20),
  attendantName: optionalText(100), attendantPhone: optionalText(20),
  status: z.enum(['ACTIVE','MAINTENANCE','INACTIVE']).default('ACTIVE'), notes: optionalText(),
});
const routeInput = z.object({
  code: z.string().trim().min(2).max(30), name: z.string().trim().min(2).max(120),
  vehicleId: z.preprocess(value => value === '' || value == null ? undefined : value, z.string().optional()),
  morningStart: timeText, afternoonStart: timeText,
  status: z.enum(['ACTIVE','INACTIVE']).default('ACTIVE'), notes: optionalText(),
  stops: z.array(z.object({ name: z.string().trim().min(2).max(120), pickupTime: timeText, dropTime: timeText, landmark: optionalText(200) })).min(1).optional(),
});
const assignmentInput = z.object({
  studentId: z.string(), routeId: z.string(),
  stopId: z.preprocess(value => value === '' || value == null ? undefined : value, z.string().optional()),
  effectiveFrom: z.coerce.date().optional(), notes: optionalText(),
});
const transportInclude = {
  vehicle: true,
  stops: { orderBy: { sequence: 'asc' as const } },
  assignments: {
    where: { status: 'ACTIVE' },
    include: { student: { include: { class: true } }, stop: true },
    orderBy: { student: { firstName: 'asc' as const } },
  },
};

modulesRouter.get('/transport', authorize('ADMIN','PARENT','STUDENT'), async (req: AuthRequest, res) => {
  if (req.user!.role !== 'ADMIN') {
    const studentWhere: Prisma.StudentWhereInput = req.user!.role === 'STUDENT'
      ? { userId: req.user!.id }
      : { parents: { some: { parent: { userId: req.user!.id } } } };
    const students = await db().student.findMany({
      where: studentWhere,
      select: {
        id: true, admissionNo: true, firstName: true, lastName: true, class: { select: { name: true, section: true } },
        transportAssignment: { include: { stop: true, route: { include: { vehicle: true, stops: { orderBy: { sequence: 'asc' } } } } } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return res.json({ role: req.user!.role, students });
  }
  const [vehicles, routes] = await Promise.all([
    db().transportVehicle.findMany({ include: { routes: { select: { id: true, name: true } } }, orderBy: { vehicleNo: 'asc' } }),
    db().transportRoute.findMany({ include: transportInclude, orderBy: { code: 'asc' } }),
  ]);
  const activeRoutes = routes.filter(route => route.status === 'ACTIVE');
  const assignedStudents = routes.reduce((sum, route) => sum + route.assignments.length, 0);
  const availableSeats = activeRoutes.reduce((sum, route) => sum + Math.max(0, (route.vehicle?.capacity ?? 0) - route.assignments.length), 0);
  return res.json({
    role: 'ADMIN', vehicles, routes,
    summary: { vehicles: vehicles.length, buses: vehicles.filter(item => item.type === 'BUS').length, vans: vehicles.filter(item => item.type === 'VAN').length, activeRoutes: activeRoutes.length, assignedStudents, availableSeats },
  });
});

modulesRouter.get('/transport/students', authorize('ADMIN'), async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json([]);
  return res.json(await db().student.findMany({
    where: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { admissionNo: { contains: q, mode: 'insensitive' } }, { guardianPhone: { contains: q } }] },
    select: { id: true, admissionNo: true, firstName: true, lastName: true, class: { select: { name: true, section: true } }, transportAssignment: { include: { route: true, stop: true } } },
    take: 20, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  }));
});

modulesRouter.post('/transport/vehicles', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed=vehicleInput.safeParse(req.body); if(!parsed.success)return res.status(400).json(parsed.error.flatten());
  const item=await db().transportVehicle.create({data:parsed.data}); await audit(req,'CREATE','TransportVehicle',item.id,{vehicleNo:item.vehicleNo,type:item.type}); return res.status(201).json(item);
});
modulesRouter.put('/transport/vehicles/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed=vehicleInput.safeParse(req.body); if(!parsed.success)return res.status(400).json(parsed.error.flatten());
  const active=await db().studentTransportAssignment.count({where:{status:'ACTIVE',route:{vehicleId:String(req.params.id)}}});
  if(parsed.data.capacity<active)return res.status(409).json({message:`Capacity cannot be lower than ${active} active student assignments.`});
  const item=await db().transportVehicle.update({where:{id:String(req.params.id)},data:parsed.data}); await audit(req,'UPDATE','TransportVehicle',item.id,{vehicleNo:item.vehicleNo}); return res.json(item);
});
modulesRouter.delete('/transport/vehicles/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const id=String(req.params.id); const routes=await db().transportRoute.count({where:{vehicleId:id}});
  if(routes)return res.status(409).json({message:'Move this vehicle off its routes before deleting it.'});
  await db().transportVehicle.delete({where:{id}}); await audit(req,'DELETE','TransportVehicle',id); return res.status(204).send();
});

modulesRouter.post('/transport/routes', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed=routeInput.safeParse(req.body); if(!parsed.success)return res.status(400).json(parsed.error.flatten());
  const {stops=[], ...data}=parsed.data;
  if(data.vehicleId){const vehicle=await db().transportVehicle.findUnique({where:{id:data.vehicleId}});if(!vehicle||vehicle.status!=='ACTIVE')return res.status(409).json({message:'Select an active vehicle.'});}
  const item=await db().transportRoute.create({data:{...data,stops:{create:stops.map((stop,index)=>({...stop,sequence:index+1}))}},include:transportInclude});
  await audit(req,'CREATE','TransportRoute',item.id,{code:item.code,stops:stops.length}); return res.status(201).json(item);
});
modulesRouter.put('/transport/routes/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed=routeInput.omit({stops:true}).safeParse(req.body); if(!parsed.success)return res.status(400).json(parsed.error.flatten());
  if(parsed.data.vehicleId){const vehicle=await db().transportVehicle.findUnique({where:{id:parsed.data.vehicleId}});if(!vehicle||vehicle.status!=='ACTIVE')return res.status(409).json({message:'Select an active vehicle.'});const assigned=await db().studentTransportAssignment.count({where:{routeId:String(req.params.id),status:'ACTIVE'}});if(assigned>vehicle.capacity)return res.status(409).json({message:`This route has ${assigned} students, exceeding that vehicle's capacity.`});}
  const item=await db().transportRoute.update({where:{id:String(req.params.id)},data:parsed.data,include:transportInclude}); await audit(req,'UPDATE','TransportRoute',item.id,{code:item.code}); return res.json(item);
});
modulesRouter.post('/transport/routes/:id/stops', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed=z.object({name:z.string().trim().min(2).max(120),pickupTime:timeText,dropTime:timeText,landmark:optionalText(200)}).safeParse(req.body);if(!parsed.success)return res.status(400).json(parsed.error.flatten());
  const last=await db().transportStop.aggregate({where:{routeId:String(req.params.id)},_max:{sequence:true}});
  const item=await db().transportStop.create({data:{...parsed.data,routeId:String(req.params.id),sequence:(last._max.sequence??0)+1}});await audit(req,'CREATE','TransportStop',item.id,{routeId:String(req.params.id)});return res.status(201).json(item);
});
modulesRouter.delete('/transport/stops/:id', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const id=String(req.params.id);if(await db().studentTransportAssignment.count({where:{stopId:id,status:'ACTIVE'}}))return res.status(409).json({message:'Reassign students from this stop before deleting it.'});
  await db().transportStop.delete({where:{id}});await audit(req,'DELETE','TransportStop',id);return res.status(204).send();
});
modulesRouter.post('/transport/assignments', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const parsed=assignmentInput.safeParse(req.body);if(!parsed.success)return res.status(400).json(parsed.error.flatten());
  const route=await db().transportRoute.findUnique({where:{id:parsed.data.routeId},include:{vehicle:true,stops:true,assignments:{where:{status:'ACTIVE'},select:{studentId:true}}}});
  if(!route||route.status!=='ACTIVE'||!route.vehicle||route.vehicle.status!=='ACTIVE')return res.status(409).json({message:'The route and its vehicle must be active.'});
  if(parsed.data.stopId&&!route.stops.some(stop=>stop.id===parsed.data.stopId))return res.status(400).json({message:'The selected stop does not belong to this route.'});
  const alreadyOnRoute=route.assignments.some(item=>item.studentId===parsed.data.studentId);
  if(!alreadyOnRoute&&route.assignments.length>=route.vehicle.capacity)return res.status(409).json({message:'This vehicle is at full capacity.'});
  const item=await db().studentTransportAssignment.upsert({where:{studentId:parsed.data.studentId},create:{...parsed.data,status:'ACTIVE'},update:{...parsed.data,status:'ACTIVE',effectiveTo:null},include:{student:true,route:true,stop:true}});
  await audit(req,'ASSIGN_TRANSPORT','StudentTransportAssignment',item.id,{studentId:item.studentId,routeId:item.routeId,stopId:item.stopId});return res.status(201).json(item);
});
modulesRouter.patch('/transport/assignments/:id/end', authorize('ADMIN'), async (req: AuthRequest, res) => {
  const item=await db().studentTransportAssignment.update({where:{id:String(req.params.id)},data:{status:'INACTIVE',effectiveTo:new Date()}});await audit(req,'END_TRANSPORT','StudentTransportAssignment',item.id,{studentId:item.studentId,routeId:item.routeId});return res.json(item);
});

modulesRouter.get('/audit', authorize('ADMIN'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1)); const limit = Math.min(100, Math.max(10, Number(req.query.limit ?? 30)));
  const q = String(req.query.q ?? '').trim(); const actionInput = String(req.query.action ?? ''); const action = actionInput.includes('_') ? actionInput : actionInput.toUpperCase().replaceAll(' ', '_'); const entityType = String(req.query.entityType ?? ''); const role = String(req.query.role ?? '');
  const from = String(req.query.from ?? ''); const to = String(req.query.to ?? '');
  const createdAt = from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } : undefined;
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}), ...(entityType ? { entityType } : {}), ...(role ? { actor: { role: role as never } } : {}), ...(createdAt ? { createdAt } : {}),
    ...(q ? { OR: [{ action: { contains: q, mode: 'insensitive' } }, { entityType: { contains: q, mode: 'insensitive' } }, { entityId: { contains: q, mode: 'insensitive' } }, { actor: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
  };
  const [data,total,actions,entities,actors,last24Hours,allTotal] = await Promise.all([
    db().auditLog.findMany({ where, include: { actor: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' }, skip: (page-1)*limit, take: limit }),
    db().auditLog.count({ where }),
    db().auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    db().auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
    db().auditLog.count({ where: { actorId: { not: null } } }),
    db().auditLog.count({ where: { createdAt: { gte: new Date(Date.now()-86_400_000) } } }),
    db().auditLog.count(),
  ]);
  res.json({ data, pagination: { page,limit,total,pages:Math.max(1,Math.ceil(total/limit)) }, filters: { actions: actions.map(item=>item.action), entityTypes: entities.map(item=>item.entityType) }, summary: { total: allTotal, actors, last24Hours } });
});
