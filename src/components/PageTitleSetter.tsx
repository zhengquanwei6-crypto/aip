'use client';

import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/constants';
import Topbar from './Topbar';

export default function PageTitleSetter() {
  const pathname = usePathname();
  const item = NAV_ITEMS.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + '/'),
  );
  return <Topbar title={item?.label ?? '平面设计接单 AI 运营工作台'} />;
}
