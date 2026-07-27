export function SectionTitle({ title, action, onClick }: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return <div className="section-title"><h2>{title}</h2>{action ? <button onClick={onClick}>{action}</button> : null}</div>;
}
