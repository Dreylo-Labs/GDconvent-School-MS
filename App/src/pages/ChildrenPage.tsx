import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Avatar } from '../components/ui/Avatar';
import { useApp } from '../context/AppContext';
import { formatClassName, formatMoney } from '../utils/formatters';

export default function ChildrenPage() {
  const { children, child, selectChild } = useApp();
  const navigate = useNavigate();
  return <AppShell title="Select child" back>{children.map(item => (
    <button className={`child-card ${child?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { selectChild(item); navigate('/'); }}>
      <Avatar name={`${item.firstName} ${item.lastName}`} /><div><h3>{item.firstName} {item.lastName}</h3><p>{formatClassName(item)} · {item.admissionNo}</p><small>{item.attendance.percentage}% attendance · {formatMoney(item.fees.outstanding)} due</small></div>{child?.id === item.id ? <CheckCircle2 /> : <ChevronRight />}
    </button>
  ))}</AppShell>;
}
