import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

/**
 * Bọc preflight của Tailwind vào `@layer base` (xem styles/astryx.css).
 *
 * NGUYÊN NHÂN GỐC (đã kiểm chứng 2026-11-12): Tailwind CSS 3.4.19 KHÔNG
 * bọc output của nó trong `@layer` — chạy pipeline PostCSS của nó lên
 * `@tailwind base;` cũng cho ra 0 lần xuất hiện `@layer`. Mọi rule
 * preflight/components/utilities của Tailwind đều KHÔNG nằm trong layer
 * nào, trong khi toàn bộ style component của Astryx nằm trong
 * `@layer astryx-base` / `@layer astryx-theme`. Theo cascade, style
 * KHÔNG layer luôn thắng style CÓ layer bất kể specificity — nên
 * preflight `button{background:transparent}`, `button{padding:0}`,
 * `*{border-width:0}` đè chết rule của Astryx dù rule Astryx có
 * `:not(#\#)` tăng specificity. Khai báo thứ tự layer trong
 * styles/astryx.css vô dụng trước lỗi này vì Tailwind không đóng góp
 * layer nào để sắp xếp.
 *
 * CÁCH SỬA NÀY — KHÔNG được bọc `@tailwind` trong `@layer` ở tailwind.css:
 * Tailwind có bước cleanup cuối pipeline xóa MỌI at-rule `@layer` tên
 * base/components/utilities/variants — đã kiểm chứng: input
 * `@layer base { @tailwind base; }` cho ra output 0 byte (mất sạch
 * preflight). Thay vào đó, plugin nhỏ dưới đây chạy SAU tailwindcss,
 * gom các rule preflight (Tailwind đánh dấu bằng metadata
 * `raws.tailwind.layer === 'base'`) vào `@layer base { ... }`. Chỉ bọc
 * preflight: components/utilities của Tailwind vẫn KHÔNG layer nên tiếp
 * tục đè Astryx như app vẫn dựa vào (utility override), còn Astryx
 * (astryx-base/astryx-theme, đứng SAU base trong thứ tự đã khai báo)
 * thắng preflight đúng như thiết kế.
 */
const wrapTailwindBaseInLayer = () => ({
  postcssPlugin: 'wrap-tailwind-base-in-layer',
  Once(root) {
    const baseNodes = [];
    let anchor = null;
    root.each((node) => {
      if (node.raws?.tailwind?.layer === 'base') {
        if (!anchor) anchor = node;
        baseNodes.push(node);
      }
    });
    if (baseNodes.length === 0 || !anchor) return;
    const layer = postcss.atRule({ name: 'layer', params: 'base' });
    anchor.before(layer);
    baseNodes.forEach((node) => layer.append(node));
  },
});
wrapTailwindBaseInLayer.postcss = true;

export default {
  plugins: [tailwindcss(), wrapTailwindBaseInLayer(), autoprefixer()],
};
