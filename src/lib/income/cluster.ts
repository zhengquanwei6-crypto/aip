/**
 * v0.16-H3.1 · K-means 简单实现 - 客户聚类
 *
 * 特征向量: [报价次数(归一化), 成交率, 平均成交价(归一化), 续单率]
 */
import type { Quote } from './store';

export interface ClientFeatures {
  name: string;
  inquiryCount: number;
  signedCount: number;
  signRate: number;
  avgWonPrice: number;
  repurchaseCount: number;     // > 1 单
  totalRevenue: number;
}

export function buildClientFeatures(quotes: Quote[]): ClientFeatures[] {
  const map = new Map<string, ClientFeatures>();
  for (const q of quotes) {
    const name = q.clientName || '(匿名)';
    if (!map.has(name)) {
      map.set(name, {
        name,
        inquiryCount: 0,
        signedCount: 0,
        signRate: 0,
        avgWonPrice: 0,
        repurchaseCount: 0,
        totalRevenue: 0,
      });
    }
    const c = map.get(name)!;
    c.inquiryCount += 1;
    if (q.status === 'won') {
      c.signedCount += 1;
      c.totalRevenue += q.finalPrice;
    }
  }
  for (const c of map.values()) {
    c.signRate = c.inquiryCount > 0 ? c.signedCount / c.inquiryCount : 0;
    c.avgWonPrice = c.signedCount > 0 ? c.totalRevenue / c.signedCount : 0;
    c.repurchaseCount = c.signedCount > 1 ? c.signedCount - 1 : 0;
  }
  return Array.from(map.values());
}

interface Vec { v: number[]; idx: number; }

export interface ClientCluster {
  label: string;
  centroidDesc: string;
  members: ClientFeatures[];
}

/** K-means K=4，按客户特征聚类 */
export function clusterClients(features: ClientFeatures[]): ClientCluster[] {
  if (features.length < 4) {
    return [{
      label: '全部客户',
      centroidDesc: '数据少 (< 4 客户)',
      members: features,
    }];
  }

  // 归一化
  const maxInquiry = Math.max(...features.map((f) => f.inquiryCount), 1);
  const maxRevenue = Math.max(...features.map((f) => f.totalRevenue), 1);
  const maxRepurchase = Math.max(...features.map((f) => f.repurchaseCount), 1);

  const vecs: Vec[] = features.map((f, i) => ({
    idx: i,
    v: [
      f.inquiryCount / maxInquiry,
      f.signRate,
      f.totalRevenue / maxRevenue,
      f.repurchaseCount / maxRepurchase,
    ],
  }));

  const K = 4;
  // 初始化：选 4 个最分散的样本
  let centroids: number[][] = [];
  centroids.push([...vecs[0].v]);
  for (let k = 1; k < K; k++) {
    let best = 0, bestDist = -1;
    for (let i = 0; i < vecs.length; i++) {
      let minD = Infinity;
      for (const c of centroids) {
        const d = dist(vecs[i].v, c);
        if (d < minD) minD = d;
      }
      if (minD > bestDist) { bestDist = minD; best = i; }
    }
    centroids.push([...vecs[best].v]);
  }

  // 迭代 20 次
  let assignments: number[] = new Array(vecs.length).fill(0);
  for (let iter = 0; iter < 20; iter++) {
    // assign
    let changed = false;
    for (let i = 0; i < vecs.length; i++) {
      let bestK = 0, bestD = Infinity;
      for (let k = 0; k < K; k++) {
        const d = dist(vecs[i].v, centroids[k]);
        if (d < bestD) { bestD = d; bestK = k; }
      }
      if (assignments[i] !== bestK) { assignments[i] = bestK; changed = true; }
    }
    if (!changed) break;
    // update centroids
    const sums = Array.from({ length: K }, () => [0, 0, 0, 0]);
    const counts = new Array(K).fill(0);
    for (let i = 0; i < vecs.length; i++) {
      const k = assignments[i];
      for (let j = 0; j < 4; j++) sums[k][j] += vecs[i].v[j];
      counts[k] += 1;
    }
    for (let k = 0; k < K; k++) {
      if (counts[k] > 0) {
        centroids[k] = sums[k].map((s) => s / counts[k]);
      }
    }
  }

  // label 每组
  const clusters: ClientCluster[] = [];
  for (let k = 0; k < K; k++) {
    const members = vecs.filter((_, i) => assignments[i] === k).map((v) => features[v.idx]);
    if (members.length === 0) continue;
    const c = centroids[k];
    let label = '一次性客户';
    if (c[1] > 0.7 && c[3] > 0.3) label = '🌟 优质长期';
    else if (c[1] > 0.5 && c[2] > 0.5) label = '💎 高价值';
    else if (c[1] < 0.3 && c[0] > 0.3) label = '🔍 价格敏感';
    else if (c[0] < 0.2) label = '🆕 新潜在';
    const desc = `成交率 ${(c[1]*100).toFixed(0)}% · 客单价 ${(c[2]*100).toFixed(0)}/100 · 复购 ${(c[3]*100).toFixed(0)}/100`;
    clusters.push({ label, centroidDesc: desc, members });
  }
  return clusters;
}

function dist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}
