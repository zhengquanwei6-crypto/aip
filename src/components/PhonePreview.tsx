'use client';

import { Heart, Star, MessageCircle, Share2, MoreHorizontal } from 'lucide-react';

/**
 * 手机框预览：高保真模拟小红书笔记 / 闲鱼商品在手机里的样子。
 */

interface XHSPreviewProps {
  platform: 'xiaohongshu';
  title: string;
  body?: string;
  coverText?: string;
  imageUrl?: string;
  tags?: string[];
}

interface XianyuPreviewProps {
  platform: 'xianyu';
  title: string;
  description?: string;
  coverText?: string;
  imageUrl?: string;
  priceRange?: string;
}

type Props = XHSPreviewProps | XianyuPreviewProps;

export default function PhonePreview(props: Props) {
  return (
    <div className="mx-auto select-none" style={{ width: 290 }}>
      {/* 手机外壳，iPhone 15 Pro 质感边框 */}
      <div className="relative rounded-[40px] bg-slate-900 p-2.5 shadow-2xl ring-1 ring-slate-800 border border-slate-700/50">
        {/* 屏幕内边框与光影反射 */}
        <div className="absolute inset-2.5 rounded-[30px] pointer-events-none z-20 border border-white/5 opacity-10 bg-gradient-to-tr from-transparent via-white/10 to-transparent"></div>
        
        {/* 屏幕区域 */}
        <div className="relative rounded-[30px] bg-slate-50 dark:bg-slate-950 overflow-hidden border border-slate-950">
          
          {/* 状态栏 + 灵动岛 (Dynamic Island) */}
          <div className="relative h-7 bg-white dark:bg-slate-900 flex items-center justify-between px-5 text-[10px] font-semibold text-slate-800 dark:text-slate-200 z-30">
            <span>9:41</span>
            
            {/* 灵动岛胶囊 */}
            <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-16 h-3.5 rounded-full bg-black flex items-center justify-center">
              {/* 摄像头小圆点 */}
              <div className="absolute right-2.5 w-1 h-1 rounded-full bg-slate-850"></div>
            </div>
            
            <div className="flex items-center gap-1">
              <span>📶</span>
              <span>5G</span>
              <span>🔋</span>
            </div>
          </div>

          {/* 渲染平台特定界面 */}
          <div className="h-[420px] overflow-y-auto scrollbar-none">
            {props.platform === 'xiaohongshu' ? (
              <XHSPreview {...props} />
            ) : (
              <XianyuPreview {...props} />
            )}
          </div>

          {/* 手机底部的虚拟 Home Indicator */}
          <div className="h-4 bg-slate-100 dark:bg-slate-900/90 flex items-center justify-center">
            <div className="w-24 h-1 rounded-full bg-slate-400 dark:bg-slate-700"></div>
          </div>
        </div>
      </div>
      <div className="text-center text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-2.5 tracking-wider">
        ✨ 拟真设备实时预览
      </div>
    </div>
  );
}

function XHSPreview({ title, body, coverText, imageUrl, tags }: XHSPreviewProps) {
  return (
    <div className="flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-full">
      {/* 小红书顶部导航栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-900/60 sticky top-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center text-[10px] text-red-500 font-bold border border-red-200 dark:border-red-900">
            R
          </div>
          <div>
            <div className="text-[11px] font-semibold leading-none">果冻的设计屋</div>
            <div className="text-[9px] text-slate-400 mt-0.5">小红书主页运营</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button className="text-[10px] px-2.5 py-0.5 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 transition-colors">
            关注
          </button>
          <Share2 className="w-3.5 h-3.5 text-slate-500 hover:text-slate-700" />
        </div>
      </div>

      {/* 小红书图片区 3:4 */}
      <div className="relative aspect-[3/4] bg-slate-100 dark:bg-slate-900 overflow-hidden flex-shrink-0">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-pink-500/10 via-rose-500/10 to-violet-500/15 flex items-center justify-center flex-col p-4 text-center">
            <span className="text-2xl mb-1.5 opacity-80">📕</span>
            <span className="text-[10px] text-slate-400 font-medium">文案关联配图占位</span>
          </div>
        )}
        {coverText && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/10 backdrop-blur-[0.5px]">
            <div className="text-center">
              <div
                className="font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] leading-tight tracking-wide"
                style={{ fontSize: '18px', fontFamily: 'system-ui, sans-serif' }}
              >
                {coverText}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 文本区域 */}
      <div className="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <div className="font-bold text-sm text-slate-900 dark:text-slate-50 leading-snug line-clamp-2">
            {title || '（未输入标题）'}
          </div>
          {body && (
            <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-6 whitespace-pre-wrap font-normal">
              {body}
            </div>
          )}
          {tags && tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {tags.slice(0, 5).map((t, i) => (
                <span key={i} className="text-[10px] font-medium text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded-sm">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 底部仿小红书写评论/互动条 */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-900 flex items-center justify-between">
          <div className="w-24 h-6 rounded-full bg-slate-100 dark:bg-slate-900 px-2.5 flex items-center">
            <span className="text-[9px] text-slate-400">说点什么...</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500">
            <div className="flex items-center gap-0.5 hover:text-red-500 cursor-pointer">
              <Heart className="w-3.5 h-3.5" />
              <span className="text-[9px] font-bold">99+</span>
            </div>
            <div className="flex items-center gap-0.5 hover:text-amber-500 cursor-pointer">
              <Star className="w-3.5 h-3.5" />
              <span className="text-[9px] font-bold">12</span>
            </div>
            <div className="flex items-center gap-0.5 hover:text-blue-500 cursor-pointer">
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="text-[9px] font-bold">8</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function XianyuPreview({
  title,
  description,
  coverText,
  imageUrl,
  priceRange,
}: XianyuPreviewProps) {
  return (
    <div className="flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-full">
      {/* 闲鱼顶部栏 */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-100 dark:border-slate-900/60 sticky top-0 bg-yellow-400 text-slate-950 font-bold text-[11px] z-10 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-xs bg-black text-yellow-400 px-1 py-0.2 rounded font-black">鱼</span>
          <span>闲鱼宝贝详情</span>
        </div>
        <MoreHorizontal className="w-4 h-4 text-slate-900" />
      </div>

      {/* 闲鱼商品首图 1:1 */}
      <div className="relative aspect-square bg-slate-100 dark:bg-slate-900 overflow-hidden flex-shrink-0">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-amber-500/10 via-yellow-500/10 to-orange-500/15 flex items-center justify-center flex-col p-4 text-center">
            <span className="text-2xl mb-1.5 opacity-80">💛</span>
            <span className="text-[10px] text-slate-400 font-medium">首图素材占位</span>
          </div>
        )}
        {coverText && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-yellow-400/90 text-slate-950 font-black text-xs px-3 py-1.5 rounded shadow-lg border border-yellow-500 leading-tight text-center">
              {coverText}
            </div>
          </div>
        )}
      </div>

      {/* 宝贝信息区 */}
      <div className="p-3.5 flex-1 flex flex-col justify-between bg-white dark:bg-slate-950">
        <div>
          {/* 价格与想要人数 */}
          <div className="flex items-baseline justify-between">
            <div className="text-lg font-black text-red-500 dark:text-red-400">
              {priceRange || '¥ 99.00'}
            </div>
            <div className="text-[9px] text-slate-400">9人想要</div>
          </div>

          <div className="mt-2 text-xs font-bold text-slate-900 dark:text-slate-50 leading-snug line-clamp-2">
            {title || '（未输入宝贝名称）'}
          </div>
          
          {description && (
            <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-5 whitespace-pre-wrap">
              {description}
            </div>
          )}
        </div>

        {/* 闲鱼底部交互栏 */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-900/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-slate-450 dark:text-slate-500">
            <div className="flex flex-col items-center cursor-pointer hover:text-slate-600">
              <Star className="w-3.5 h-3.5" />
              <span className="text-[8px] mt-0.5">想要</span>
            </div>
            <div className="flex flex-col items-center cursor-pointer hover:text-slate-600">
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="text-[8px] mt-0.5">留言</span>
            </div>
          </div>
          
          <div className="flex gap-1.5 flex-1 justify-end">
            <button className="text-[9px] font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              聊一聊
            </button>
            <button className="text-[9px] font-bold px-4.5 py-1.5 rounded-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 shadow-sm">
              立即购买
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
