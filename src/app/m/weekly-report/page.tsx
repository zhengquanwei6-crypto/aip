import { generateWeeklyReport } from '@/lib/weekly';
import MWeeklyReportClient from './MWeeklyReportClient';

export const dynamic = 'force-dynamic';

export default async function MWeeklyReportPage() {
  const report = await generateWeeklyReport();
  return <MWeeklyReportClient initial={report} />;
}
