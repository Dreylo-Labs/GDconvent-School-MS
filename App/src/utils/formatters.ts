import type { Child } from '../types/models';

export const formatMoney = (value = 0) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

export const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

export const formatClassName = (child?: Child | null) =>
  child?.class
    ? `${child.class.name}${child.class.section ? `-${child.class.section}` : ''}`
    : 'Class not assigned';

export const humanizeCode = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase();
