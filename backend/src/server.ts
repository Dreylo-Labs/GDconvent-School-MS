import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './routes/auth.js';
import { resourceRouter } from './routes/resources.js';
import { authenticate } from './middleware/auth.js';
import { modulesRouter } from './routes/modules.js';
import { runMonthlyBilling, schoolDate } from './services/fee-billing.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
const app = express();
app.use(helmet()); app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' })); app.use(express.json()); app.use(morgan('dev'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'gd-school-api' }));
app.use('/api/auth', authRouter); app.use('/api/modules', authenticate, modulesRouter); app.use('/api', authenticate, resourceRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error(err); res.status(500).json({ message: 'Internal server error' }); });
app.listen(Number(process.env.PORT ?? 4000), () => {
  console.log(`API ready on http://localhost:${process.env.PORT ?? 4000}`);
  if (process.env.DISABLE_AUTOMATIC_BILLING !== 'true') {
    void runMonthlyBilling().then(result => console.log('Fee billing catch-up complete', result)).catch(error => console.error('Fee billing catch-up failed', error));
  }
});

setInterval(() => {
  if (process.env.DISABLE_AUTOMATIC_BILLING === 'true' || schoolDate().getUTCDate() !== 1) return;
  void runMonthlyBilling().then(result => console.log('Automatic monthly fee billing complete', result)).catch(error => console.error('Automatic monthly fee billing failed', error));
}, 60 * 60 * 1000).unref();
