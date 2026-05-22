/**
 * 日期工具：周一为 1，周日为 7（与 Schedule.dayOfWeek 一致）。
 */

export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function todayDayOfWeek(d: Date = new Date()): number {
  const w = d.getDay(); // 0=Sun .. 6=Sat
  return w === 0 ? 7 : w;
}

export function formatDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatDateCN(d: Date = new Date()): string {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${days[d.getDay()]}`;
}

/** 获取本周（周一开始）的 7 天日期 */
export function getWeekDates(base: Date = new Date()): Date[] {
  const dow = todayDayOfWeek(base); // 1..7
  const monday = new Date(base);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(base.getDate() - (dow - 1));
  const arr: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    arr.push(d);
  }
  return arr;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function daysAgo(n: number, base: Date = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}
