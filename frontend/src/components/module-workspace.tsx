'use client';
import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';

type ModuleConfig = { title: string; description: string; action: string; tabs: string[]; columns: string[]; rows: string[][]; endpoint?: string };
const configs: Record<string, ModuleConfig> = {
  library: { title: 'Library & Circulation', description: 'Catalog resources, issue and return books, renew loans, and manage overdue fines.', action: 'Add catalog item', tabs: ['Catalog','Circulation','Overdue','Fines'], columns: ['Book','Author','ISBN','Available','Shelf'], rows: [['The Discovery of India','Jawaharlal Nehru','9789354401658','5 / 5','H-12'],['Wings of Fire','A. P. J. Abdul Kalam','9788173711466','2 / 4','B-08'],['A Brief History of Time','Stephen Hawking','9780553380163','1 / 3','S-14']], endpoint: 'modules/library/books' },
};

export function ModuleWorkspace({ module }: { module: string }) {
  const config = configs[module];
  const [tab, setTab] = useState(config?.tabs[0] ?? 'Overview');
  const [query, setQuery] = useState('');
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { if (!config?.endpoint) return; fetch(`/api/proxy/${config.endpoint}`).then(response => response.ok ? response.json() : []).then(data => setCount(Array.isArray(data) ? data.length : null)).catch(() => setCount(null)); }, [config?.endpoint]);
  const rows = useMemo(() => config?.rows.filter(row => row.join(' ').toLowerCase().includes(query.toLowerCase())) ?? [], [config, query]);
  if (!config) return <div className="moduleNotFound"><h1>Module not found</h1><p>The requested workspace is not configured.</p></div>;
  return <><div className="pageHead"><div><h1>{config.title}</h1><p>{config.description}</p></div><button className="primary"><PlusIcon />{config.action}</button></div><div className="moduleStats"><div><strong>{count ?? rows.length}</strong><span>Active records</span></div><div><strong>{config.tabs.length}</strong><span>Workflow views</span></div><div><strong>Today</strong><span>Last synchronized</span></div></div><section className="panel modulePanel"><div className="moduleToolbar"><div className="facilityTabs">{config.tabs.map(value => <button key={value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>{value}</button>)}</div><label className="search compact"><MagnifyingGlassIcon /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}…`} /></label></div><div className="tableWrap"><table><thead><tr>{config.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={`${row[0]}-${index}`}>{row.map((cell,cellIndex)=><td key={`${cell}-${cellIndex}`}>{cellIndex === 0 ? <strong>{cell}</strong> : cellIndex === row.length - 1 ? <span className="status present">{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div></section></>;
}
