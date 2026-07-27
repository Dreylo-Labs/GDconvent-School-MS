import { AppShell } from '@/components/app-shell';

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="pageHead">
        <div><h1>Settings</h1><p>Manage school profile, academic year, and system preferences.</p></div>
      </div>
      <section className="panel" style={{ padding: 24 }}>
        <div className="panelTitle"><div><h2>School profile</h2><p>G.D. Convent Sr Sec School · Academic year 2026–27</p></div></div>
      </section>
    </AppShell>
  );
}
