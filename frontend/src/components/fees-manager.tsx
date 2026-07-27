'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { BanknotesIcon, DocumentArrowDownIcon, EyeIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from './auth-provider';
import { FeeMaster } from './fee-master';

type SchoolClass = { id: string; name: string; section: string };
type Fee = { id: string; invoiceNo?: string; title: string; amount: string; paidAmount: string; outstanding: number; dueDate: string; status: string; student: { id: string; admissionNo: string; firstName: string; lastName: string; class?: SchoolClass }; payments: { id: string; receiptNo: string; amount: string; method: string; paidAt: string }[] };
type CounterStudent = { id: string; admissionNo: string; firstName: string; lastName: string; guardianName: string; guardianPhone: string; class?: SchoolClass; outstanding: number; advanceBalance: number };
type AdvanceEntry = { id: string; amount: string; description: string; referenceId?: string; occurredAt: string; student: { id: string; admissionNo: string; firstName: string; lastName: string; class?: SchoolClass } };
const classLabel = (item: SchoolClass) => item.section ? `${item.name}-${item.section}` : item.name;

export function FeesManager() {
  const { user } = useAuth();
  const [fees, setFees] = useState<Fee[]>([]);
  const [advances, setAdvances] = useState<AdvanceEntry[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [summary, setSummary] = useState({ billed: 0, collected: 0, outstanding: 0, advance: 0 });
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState<Fee | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const [workspace, setWorkspace] = useState<'TRANSACTIONS'|'CREDITS'|'MASTER'>('TRANSACTIONS');
  const canCollect = user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT';

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (query) params.set('q', query); if (classId) params.set('classId', classId); if (status) params.set('status', status);
    const response = await fetch(`/api/proxy/fees?${params}`, { cache: 'no-store' });
    if (response.ok) { const data = await response.json(); setFees(data.data); setAdvances(data.advances ?? []); setSummary(data.summary); setPagination(data.pagination); }
    setLoading(false);
  }
  useEffect(() => { if (canCollect) fetch('/api/proxy/classes').then(response => response.ok ? response.json() : []).then(setClasses); }, [canCollect]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [query,classId,status,page]);

  return <>
    <div className="pageHead"><div><h1>Fees</h1><p>{workspace==='MASTER'?'Configure class-wise fee breakup and monthly billing.':workspace==='CREDITS'?'Review unallocated payments that will settle future student charges.':canCollect ? 'Review student balances, collect partial payments, and issue invoices.' : 'Review your student fee balances, payments, and invoices.'}</p></div>{canCollect&&workspace!=='MASTER'&&<button className="primary" onClick={() => setCounterOpen(true)}><BanknotesIcon />Collect student fee</button>}</div>
    {canCollect&&<div className="feeWorkspaceTabs"><button className={workspace==='TRANSACTIONS'?'active':''} onClick={()=>setWorkspace('TRANSACTIONS')}>Fee ledger</button><button className={workspace==='CREDITS'?'active':''} onClick={()=>setWorkspace('CREDITS')}>Advance credits <span>{advances.length}</span></button><button className={workspace==='MASTER'?'active':''} onClick={()=>setWorkspace('MASTER')}>Fee master & billing</button></div>}
    {workspace==='MASTER'?<FeeMaster/>:<>
    <div className="feeSummary four"><div><span>Total billed</span><strong>₹{summary.billed.toLocaleString('en-IN')}</strong></div><div><span>Collected against invoices</span><strong className="greenText">₹{summary.collected.toLocaleString('en-IN')}</strong></div><div><span>Outstanding</span><strong className="redText">₹{summary.outstanding.toLocaleString('en-IN')}</strong></div><div><span>Advance credit held</span><strong className="blueText">₹{summary.advance.toLocaleString('en-IN')}</strong></div></div>
    {workspace==='TRANSACTIONS'&&<>
    <section className="panel feePanel">
      <div className="feeToolbar"><label className="search compact"><MagnifyingGlassIcon /><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search name or admission number…" /></label>{canCollect && <select value={classId} onChange={event => { setClassId(event.target.value); setPage(1); }}><option value="">All classes</option>{classes.map(item => <option value={item.id} key={item.id}>{classLabel(item)}</option>)}</select>}<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="PARTIAL">Partially paid</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option></select></div>
      <div className="tableWrap"><table><thead><tr><th>Invoice</th><th>Student</th><th>Class</th><th>Description</th><th>Due</th><th>Billed</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={10}><div className="tableState">Loading fee accounts…</div></td></tr> : fees.length ? fees.map(fee => <tr key={fee.id}><td className="mono">{fee.invoiceNo || '—'}</td><td><strong>{fee.student.firstName} {fee.student.lastName}</strong><small className="cellSubtext">{fee.student.admissionNo}</small></td><td>{fee.student.class ? classLabel(fee.student.class) : '—'}</td><td>{fee.title}</td><td>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(fee.dueDate))}</td><td>₹{Number(fee.amount).toLocaleString('en-IN')}</td><td>₹{Number(fee.paidAmount).toLocaleString('en-IN')}</td><td><strong>₹{fee.outstanding.toLocaleString('en-IN')}</strong></td><td><span className={`status ${fee.status === 'PAID' ? 'present' : fee.status === 'OVERDUE' ? 'absent' : 'late'}`}>{fee.status}</span></td><td><div className="feeActions"><Link href={`/fees/students/${fee.student.id}`} aria-label={`View ${fee.student.firstName} fee account`}><EyeIcon /></Link><a href={`/api/proxy/fees/${fee.id}/invoice.pdf`} aria-label="Download invoice"><DocumentArrowDownIcon /></a>{canCollect && fee.outstanding > 0 && <button className="collectFeeButton" onClick={() => setCollecting(fee)}><BanknotesIcon />Collect fee</button>}</div></td></tr>) : <tr><td colSpan={10}><div className="tableState">No fee records match these filters.</div></td></tr>}</tbody></table></div>
      <div className="pagination"><span>Showing {fees.length} of {pagination.total} invoices</span><div><button disabled={page<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><button className="current">{page}</button><button disabled={page>=pagination.pages} onClick={()=>setPage(value=>value+1)}>Next</button></div></div>
    </section>
    </>}
    {workspace==='CREDITS'&&<section className="panel advancePanel standalone"><div className="sectionHeading"><div><h2>Advance credit ledger</h2><p>Unallocated student credit available for future fees.</p></div></div><div className="tableWrap"><table><thead><tr><th>Receipt</th><th>Student</th><th>Class</th><th>Date</th><th>Description</th><th>Credit</th><th>Action</th></tr></thead><tbody>{advances.length?advances.map(entry=><tr key={entry.id}><td className="mono">{entry.referenceId||'ADVANCE'}</td><td><strong>{entry.student.firstName} {entry.student.lastName}</strong><small className="cellSubtext">{entry.student.admissionNo}</small></td><td>{entry.student.class?classLabel(entry.student.class):'—'}</td><td>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(entry.occurredAt))}</td><td>{entry.description}</td><td><strong className="greenText">₹{Number(entry.amount).toLocaleString('en-IN')}</strong></td><td><Link href={`/students/${entry.student.id}`}>View student</Link></td></tr>):<tr><td colSpan={7}><div className="tableState">No advance credits are currently held.</div></td></tr>}</tbody></table></div></section>}
    </>}
    {collecting && <PaymentDialog fee={collecting} onClose={() => setCollecting(null)} onSaved={async () => { setCollecting(null); await load(); }} />}
    {counterOpen && <FeeCounter onClose={() => setCounterOpen(false)} onSaved={load} />}
  </>;
}

export function FeeCounter({ onClose, onSaved, initialStudent = null }: { onClose: () => void; onSaved: () => Promise<void>; initialStudent?: CounterStudent | null }) {
  const [query,setQuery]=useState(''); const [results,setResults]=useState<CounterStudent[]>([]); const [student,setStudent]=useState<CounterStudent|null>(initialStudent);
  const [account,setAccount]=useState<{fees:Fee[];summary:{outstanding:number;advanceBalance:number}}|null>(null); const [mode,setMode]=useState<'DUE'|'ADVANCE'|'CHARGE'>('DUE');
  const [saving,setSaving]=useState(false); const [error,setError]=useState(''); const [success,setSuccess]=useState('');
  useEffect(()=>{if(query.trim().length<2){setResults([]);return;}const timer=window.setTimeout(async()=>{const response=await fetch(`/api/proxy/fees/counter/students?q=${encodeURIComponent(query)}`);if(response.ok)setResults(await response.json());},250);return()=>window.clearTimeout(timer);},[query]);
  useEffect(()=>{if(initialStudent)void choose(initialStudent);},[initialStudent?.id]);
  async function choose(item:CounterStudent){setStudent(item);setResults([]);const response=await fetch(`/api/proxy/fees/students/${item.id}`,{cache:'no-store'});if(response.ok)setAccount(await response.json());}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!student)return;setSaving(true);setError('');setSuccess('');const form=new FormData(event.currentTarget);
    let url='';let body:Record<string,unknown>={};
    if(mode==='DUE'){const feeId=String(form.get('feeId')||'');url=`/api/proxy/fees/${feeId}/payments`;body={amount:form.get('amount'),method:form.get('method')!,transactionRef:form.get('transactionRef')||undefined};}
    if(mode==='ADVANCE'){url=`/api/proxy/fees/students/${student.id}/advance`;body={amount:form.get('amount'),method:form.get('method')!,transactionRef:form.get('transactionRef')||undefined,note:form.get('note')||undefined};}
    if(mode==='CHARGE'){url=`/api/proxy/fees/students/${student.id}/charges`;body={title:form.get('title')!,category:form.get('category')!,amount:form.get('amount')!,collectAmount:form.get('collectAmount')||0,dueDate:form.get('dueDate')!,method:form.get('method')!,transactionRef:form.get('transactionRef')||undefined};}
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));
    if(!response.ok){setError(data.message||'The transaction could not be completed.');setSaving(false);return;}
    setSuccess(mode==='ADVANCE'?`Advance credit recorded${data.receiptNo?` · ${data.receiptNo}`:''}.`:'Fee transaction recorded successfully.');setSaving(false);await choose(student);await onSaved();(event.currentTarget as HTMLFormElement).reset();
  }
  const unpaid=account?.fees.filter(fee=>fee.outstanding>0)||[];
  return <div className="dialogBackdrop" onMouseDown={onClose}><div className="facilityDialog feeCounterDialog" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}>
    <div className="dialogTitle"><div><h2>Student fee counter</h2><p>Search any student, review the account, then receive the correct type of payment.</p></div><button onClick={onClose} aria-label="Close"><XMarkIcon /></button></div>
    {!student?<div className="counterSearch"><label className="search"><MagnifyingGlassIcon/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Student name, admission no., guardian or phone…"/></label>{query.length>1&&!results.length&&<p>Searching student records…</p>}<div className="counterResults">{results.map(item=><button key={item.id} onClick={()=>void choose(item)}><span><strong>{item.firstName} {item.lastName}</strong><small>{item.admissionNo} · {item.class?classLabel(item.class):'No class'} · Guardian: {item.guardianName}</small></span><span><small>Outstanding</small><strong>₹{item.outstanding.toLocaleString('en-IN')}</strong></span></button>)}</div></div>
    :<div className="counterWorkspace"><div className="selectedStudent"><button onClick={()=>{setStudent(null);setAccount(null);setQuery('');}}>Change student</button><span><strong>{student.firstName} {student.lastName}</strong><small>{student.admissionNo} · {student.class?classLabel(student.class):'No class'} · {student.guardianName}</small></span><dl><div><dt>Outstanding</dt><dd>₹{account?.summary.outstanding.toLocaleString('en-IN')||'0'}</dd></div><div><dt>Advance credit</dt><dd>₹{account?.summary.advanceBalance.toLocaleString('en-IN')||'0'}</dd></div></dl></div>
      <div className="counterTabs"><button className={mode==='DUE'?'active':''} onClick={()=>setMode('DUE')}>Pay existing due</button><button className={mode==='ADVANCE'?'active':''} onClick={()=>setMode('ADVANCE')}>Receive advance</button><button className={mode==='CHARGE'?'active':''} onClick={()=>setMode('CHARGE')}><PlusIcon/>Other fee</button></div>
      <form className="facilityForm counterForm" onSubmit={submit}>
        {mode==='DUE'&&<>{unpaid.length?<label>Outstanding invoice<select name="feeId" required>{unpaid.map(fee=><option value={fee.id} key={fee.id}>{fee.title} · Due ₹{fee.outstanding.toLocaleString('en-IN')}</option>)}</select></label>:<div className="counterEmpty">This student has no outstanding invoices. Use Advance or Other fee instead.</div>}<label>Amount received<input name="amount" type="number" min=".01" step=".01" required disabled={!unpaid.length}/></label></>}
        {mode==='ADVANCE'&&<><div className="counterNotice">Advance credit is kept separately and can be adjusted against future monthly or other fees.</div><label>Advance amount<input name="amount" type="number" min=".01" step=".01" required/></label><label>Note<input name="note" placeholder="Optional purpose or instruction"/></label></>}
        {mode==='CHARGE'&&<><div className="formColumns"><label>Fee name<input name="title" required placeholder="e.g. Jaipur educational tour"/></label><label>Category<select name="category"><option value="TOUR">Tour</option><option value="ACTIVITY">Activity</option><option value="TRANSPORT">Transport</option><option value="UNIFORM">Uniform</option><option value="BOOKS">Books</option><option value="EXAM">Exam</option><option value="FINE">Fine</option><option value="OTHER">Other</option></select></label></div><div className="formColumns"><label>Charge amount<input name="amount" type="number" min=".01" step=".01" required/></label><label>Collect now<input name="collectAmount" type="number" min="0" step=".01" defaultValue="0"/></label></div><label>Due date<input name="dueDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label></>}
        {(mode!=='DUE'||unpaid.length>0)&&<><div className="formColumns"><label>Payment method<select name="method"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></label><label>Transaction reference<input name="transactionRef" placeholder="Optional"/></label></div>{error&&<div className="loginError">{error}</div>}{success&&<div className="counterSuccess">{success}</div>}<div className="dialogButtons"><button type="button" onClick={onClose}>Close</button><button className="primary" disabled={saving}>{saving?'Saving…':mode==='CHARGE'?'Create fee':'Receive payment'}</button></div></>}
      </form>
    </div>}
  </div></div>;
}

function PaymentDialog({ fee, onClose, onSaved }: { fee: Fee; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError('');const form=new FormData(event.currentTarget);const response=await fetch(`/api/proxy/fees/${fee.id}/payments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:form.get('amount'),method:form.get('method'),transactionRef:form.get('transactionRef')||undefined})});const data=await response.json().catch(()=>({}));if(!response.ok){setError(data.message||'Payment could not be collected.');setSaving(false);return;}setSaving(false);await onSaved();}
  return <div className="dialogBackdrop" onMouseDown={onClose}><div className="facilityDialog paymentDialog" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><div className="dialogTitle"><div><h2>Collect payment</h2><p>{fee.student.firstName} {fee.student.lastName} · {fee.invoiceNo}</p></div><button onClick={onClose} aria-label="Close"><XMarkIcon /></button></div><form className="facilityForm" onSubmit={submit}><div className="paymentBalance"><span>Outstanding balance</span><strong>₹{fee.outstanding.toLocaleString('en-IN')}</strong><small>Partial payments are allowed.</small></div><label>Amount received<input name="amount" type="number" min=".01" max={fee.outstanding} step=".01" required defaultValue={fee.outstanding} /></label><div className="formColumns"><label>Payment method<select name="method"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></label><label>Transaction reference<input name="transactionRef" placeholder="Optional" /></label></div>{error&&<div className="loginError">{error}</div>}<div className="dialogButtons"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving?'Collecting…':'Collect payment'}</button></div></form></div></div>;
}
