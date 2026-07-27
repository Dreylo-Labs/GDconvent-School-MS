import { FileText, type LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon = FileText, title, text }: {
  icon?: LucideIcon;
  title: string;
  text: string;
}) {
  return <div className="empty"><Icon /><strong>{title}</strong><p>{text}</p></div>;
}
