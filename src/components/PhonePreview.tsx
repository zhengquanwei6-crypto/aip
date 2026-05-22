'use client';

/**
 * 手机框预览：模拟小红书笔记 / 闲鱼商品在手机里的样子。
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
    <div className="mx-auto" style={{ width: 280 }}>
      <div className="rounded-[36px] bg-slate-900 p-2 shadow-xl">
        <div className="rounded-[28px] bg-white overflow-hidden">
          {/* 状态栏 */}
          <div className="h-6 bg-white flex items-center justify-between px-4 text-[10px] text-slate-500">
            <span>9:41</span>
            <span>·····</span>
            <span>100%</span>
          </div>
          {/* 内容 */}
          {props.platform === 'xiaohongshu' ? (
            <XHSPreview {...props} />
          ) : (
            <XianyuPreview {...props} />
          )}
        </div>
      </div>
      <div className="text-center text-xs text-slate-400 mt-2">
        手机预览（仅参考）
      </div>
    </div>
  );
}

function XHSPreview({ title, body, coverText, imageUrl, tags }: XHSPreviewProps) {
  // 小红书封面 3:4
  return (
    <div>
      <div className="relative aspect-[3/4] bg-slate-100 overflow-hidden">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-pink-100 to-rose-200" />
        )}
        {coverText && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center">
              <div
                className="font-bold text-white drop-shadow-lg leading-tight"
                style={{ fontSize: '22px' }}
              >
                {coverText}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-semibold text-sm text-slate-800 leading-snug line-clamp-2">
          {title || '（标题）'}
        </div>
        {body && (
          <div className="mt-2 text-xs text-slate-700 leading-relaxed line-clamp-5 whitespace-pre-wrap">
            {body}
          </div>
        )}
        {tags && tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 6).map((t, i) => (
              <span key={i} className="text-[10px] text-blue-600">
                #{t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-3 text-[10px] text-slate-400">
          <span>❤️ 999</span>
          <span>⭐ 99</span>
          <span>💬 99</span>
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
    <div>
      <div className="relative aspect-square bg-slate-100 overflow-hidden">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-amber-100 to-yellow-200" />
        )}
        {coverText && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              className="font-bold text-amber-900 leading-tight bg-white/80 px-3 py-1.5 rounded"
              style={{ fontSize: '18px' }}
            >
              {coverText}
            </div>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-base font-semibold text-rose-600">
          {priceRange || '¥ ___'}
        </div>
        <div className="mt-1 text-sm text-slate-800 leading-snug line-clamp-2">
          {title || '（商品标题）'}
        </div>
        {description && (
          <div className="mt-2 text-xs text-slate-600 leading-relaxed line-clamp-4 whitespace-pre-wrap">
            {description}
          </div>
        )}
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1 text-[10px] text-slate-400">
          <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
            闲鱼
          </span>
          <span className="ml-auto">浏览 99 · 想要 9</span>
        </div>
      </div>
    </div>
  );
}
