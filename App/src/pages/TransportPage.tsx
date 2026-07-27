import { useEffect, useState } from 'react';
import { BusFront, Clock3, MapPin, Phone, Route, UserRound } from 'lucide-react';
import { api } from '../api';
import { EmptyState } from '../components/feedback/EmptyState';
import { AppShell } from '../components/layout/AppShell';
import { useApp } from '../context/AppContext';
import type { TransportStudent } from '../types/models';

type TransportResponse = {
  role: 'PARENT' | 'STUDENT';
  students: TransportStudent[];
};

export default function TransportPage() {
  const { child } = useApp();
  const [students, setStudents] = useState<TransportStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<TransportResponse>('/modules/transport')
      .then(result => { if (active) setStudents(result.students); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Transport details are unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const student = students.find(item => item.id === child?.id) ?? students[0];
  const assignment = student?.transportAssignment;
  const route = assignment?.route;
  const vehicle = route?.vehicle;
  const stop = assignment?.stop;

  return (
    <AppShell title="School transport" back>
      {loading ? <div className="card empty"><BusFront /><strong>Loading transport details…</strong></div> : null}
      {!loading && error ? <EmptyState title="Transport unavailable" text={error} /> : null}
      {!loading && !error && (!assignment || assignment.status !== 'ACTIVE') ? (
        <EmptyState title="Transport not assigned" text="No active school transport assignment is linked to this student. Please contact the school office if this is unexpected." />
      ) : null}
      {!loading && !error && assignment && assignment.status === 'ACTIVE' ? (
        <div className="transport-mobile">
          <section className="transport-vehicle-card">
            <div className="transport-vehicle-icon"><BusFront /></div>
            <div>
              <small>{vehicle?.type || 'SCHOOL TRANSPORT'}</small>
              <h1>{vehicle?.vehicleNo || 'Vehicle pending'}</h1>
              <p>{vehicle?.registrationNo || 'Registration not available'}</p>
            </div>
            <span>{vehicle?.status || route?.status || 'ACTIVE'}</span>
          </section>

          <section className="card transport-route-card">
            <div className="transport-section-title"><Route /><div><small>Your route</small><h2>{route?.code} · {route?.name}</h2></div></div>
            <div className="transport-stop">
              <MapPin />
              <div><small>Pickup stop</small><strong>{stop?.name || 'Stop not selected'}</strong>{stop?.landmark ? <p>{stop.landmark}</p> : null}</div>
            </div>
            <div className="transport-time-grid">
              <Time label="Pickup time" value={stop?.pickupTime} />
              <Time label="Return time" value={stop?.dropTime} />
              <Time label="Route starts" value={route?.morningStart} />
              <Time label="School departure" value={route?.afternoonStart} />
            </div>
          </section>

          <section className="card transport-contact-card">
            <h2>Transport contacts</h2>
            <Contact role="Driver" name={vehicle?.driverName} phone={vehicle?.driverPhone} />
            <Contact role="Attendant" name={vehicle?.attendantName} phone={vehicle?.attendantPhone} />
          </section>
          {assignment.notes ? <p className="transport-note"><strong>School note:</strong> {assignment.notes}</p> : null}
        </div>
      ) : null}
    </AppShell>
  );
}

function Time({ label, value }: { label: string; value?: string }) {
  return <div><Clock3 /><span><small>{label}</small><strong>{value || '—'}</strong></span></div>;
}

function Contact({ role, name, phone }: { role: string; name?: string; phone?: string }) {
  return (
    <div className="transport-contact">
      <UserRound />
      <div><small>{role}</small><strong>{name || 'Not assigned'}</strong></div>
      {phone ? <a href={`tel:${phone}`} aria-label={`Call ${role}`}><Phone /></a> : <span className="transport-no-phone">—</span>}
    </div>
  );
}
