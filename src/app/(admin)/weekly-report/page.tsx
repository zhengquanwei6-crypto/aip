import { generateWeeklyReport } from '@/lib/weekly';
import WeeklyReportClient from './WeeklyReportClient';

export const dynamic = 'force-dynamic';

export default async function WeeklyReportPage() {
  const report = await generateWeeklyReport();
  return <WeeklyReportClient initial={report} />;
}
