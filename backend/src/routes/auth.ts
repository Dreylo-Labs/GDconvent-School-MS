import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();
const otpChallenges = new Map<string, { userId: string; role: 'PARENT' | 'STUDENT'; expiresAt: number; attempts: number; requestedAt: number }>();
const normalizeIndianPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
};
const maskPhone = (phone: string) => `${phone.slice(0, 3)}******${phone.slice(-3)}`;
const sessionFor = (user: { id: string; role: string }) => jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '8h' });

async function provisionParentByPhone(phone: string) {
  const database = getDb();
  const existing = await database.parentProfile.findFirst({ where: { phone }, include: { user: true } });
  if (existing) return existing.user;
  const matchingStudents = await database.student.findMany({ where: { guardianPhone: { in: [phone, phone.slice(3), `0${phone.slice(3)}`] } } });
  if (!matchingStudents.length) return null;
  return database.$transaction(async tx => {
    const suffix = phone.slice(-10);
    const email = `parent.${suffix}@login.gdconvent.local`;
    const user = await tx.user.upsert({
      where: { email },
      update: { isActive: true, role: 'PARENT' },
      create: { email, name: matchingStudents[0].guardianName, role: 'PARENT', password: await bcrypt.hash(`OTP-${suffix}-${Date.now()}`, 12) },
    });
    const parent = await tx.parentProfile.upsert({ where: { userId: user.id }, update: { phone }, create: { userId: user.id, phone } });
    for (const student of matchingStudents) await tx.parentStudent.upsert({
      where: { parentId_studentId: { parentId: parent.id, studentId: student.id } },
      update: {},
      create: { parentId: parent.id, studentId: student.id, relationship: 'Guardian', isPrimary: true },
    });
    return user;
  });
}

authRouter.post('/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(6) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid credentials', errors: parsed.error.flatten() });
  const user = await getDb().user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.password))) return res.status(401).json({ message: 'Invalid email or password' });
  const token = sessionFor(user);
  await getDb().$transaction([
    getDb().user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    getDb().auditLog.create({ data: { actorId: user.id, action: 'LOGIN', entityType: 'Session', ipAddress: req.ip, userAgent: req.headers['user-agent'] } }),
  ]);
  return res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

authRouter.post('/otp/request', async (req, res) => {
  const parsed = z.object({ role: z.enum(['PARENT', 'STUDENT']), identifier: z.string().trim().min(3).max(50) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a valid mobile number or admission number.' });
  const database = getDb();
  let user: { id: string; role: string; isActive: boolean } | null = null;
  let destination: string | null = null;
  let lookupKey = parsed.data.identifier.toUpperCase();
  if (parsed.data.role === 'PARENT') {
    const phone = normalizeIndianPhone(parsed.data.identifier);
    if (phone) {
      lookupKey = phone;
      user = await provisionParentByPhone(phone);
      destination = phone;
    }
  } else {
    const phone = normalizeIndianPhone(parsed.data.identifier);
    const student = await database.student.findFirst({
      where: phone ? { phone: { in: [phone, phone.slice(3), `0${phone.slice(3)}`] } } : { admissionNo: { equals: parsed.data.identifier, mode: 'insensitive' } },
      include: { user: true },
    });
    if (student) {
      destination = normalizeIndianPhone(student.phone ?? '') ?? normalizeIndianPhone(student.guardianPhone);
      lookupKey = student.admissionNo.toUpperCase();
      if (student.user) user = student.user;
      else {
        const email = `student.${student.admissionNo.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@login.gdconvent.local`;
        user = await database.$transaction(async tx => {
          const created = await tx.user.upsert({ where: { email }, update: { isActive: true, role: 'STUDENT' }, create: { email, name: `${student.firstName} ${student.lastName}`, role: 'STUDENT', password: await bcrypt.hash(`OTP-${student.id}-${Date.now()}`, 12) } });
          await tx.student.update({ where: { id: student.id }, data: { userId: created.id } });
          return created;
        });
      }
    }
  }
  if (!user || !user.isActive || !destination) return res.status(400).json({ message: 'No active account is linked to those details. Please contact the school office.' });
  const throttleKey = `${parsed.data.role}:${lookupKey}`;
  const previous = otpChallenges.get(throttleKey);
  if (previous && Date.now() - previous.requestedAt < 30_000) return res.status(429).json({ message: 'Please wait 30 seconds before requesting another OTP.' });
  const challengeId = `${throttleKey}:${crypto.randomUUID()}`;
  otpChallenges.set(challengeId, { userId: user.id, role: parsed.data.role, expiresAt: Date.now() + 5 * 60_000, attempts: 0, requestedAt: Date.now() });
  otpChallenges.set(throttleKey, { userId: user.id, role: parsed.data.role, expiresAt: Date.now() + 5 * 60_000, attempts: 0, requestedAt: Date.now() });
  return res.json({ challengeId, destination: maskPhone(destination), expiresIn: 300, demoOtp: process.env.DEFAULT_LOGIN_OTP ?? '111111' });
});

authRouter.post('/otp/verify', async (req, res) => {
  const parsed = z.object({ challengeId: z.string().min(1), otp: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter the six-digit OTP.' });
  const challenge = otpChallenges.get(parsed.data.challengeId);
  if (!challenge || challenge.expiresAt < Date.now()) return res.status(401).json({ message: 'This OTP has expired. Request a new one.' });
  challenge.attempts += 1;
  if (challenge.attempts > 5) { otpChallenges.delete(parsed.data.challengeId); return res.status(429).json({ message: 'Too many attempts. Request a new OTP.' }); }
  if (parsed.data.otp !== (process.env.DEFAULT_LOGIN_OTP ?? '111111')) return res.status(401).json({ message: 'Incorrect OTP.' });
  const user = await getDb().user.findFirst({ where: { id: challenge.userId, isActive: true }, select: { id: true, email: true, name: true, role: true } });
  if (!user || user.role !== challenge.role) return res.status(401).json({ message: 'Account access is no longer available.' });
  otpChallenges.delete(parsed.data.challengeId);
  const token = sessionFor(user);
  await getDb().$transaction([
    getDb().user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    getDb().auditLog.create({ data: { actorId: user.id, action: 'OTP_LOGIN', entityType: 'Session', ipAddress: req.ip, userAgent: req.headers['user-agent'], metadata: { role: user.role } } }),
  ]);
  return res.json({ token, user });
});

authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  const user = await getDb().user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, name: true, role: true } });
  if (!user) return res.status(401).json({ message: 'User no longer exists' });
  return res.json({ user });
});
