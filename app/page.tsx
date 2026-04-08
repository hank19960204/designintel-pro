import Dashboard from '@/components/Dashboard';

// 讓首頁在每次請求時都是動態渲染（不快取，確保 Notion 資料即時）
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return <Dashboard />;
}
