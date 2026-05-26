import SearchClient from './SearchClient';
export const dynamic = 'force-dynamic';
export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  return <SearchClient initialQuery={searchParams.q || ''} />;
}
