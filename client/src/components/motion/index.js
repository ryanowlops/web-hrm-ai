// Barrel cho motion primitives v4 — liều chuyển động đã giảm theo hợp đồng
// docs/frontend-design-v4.md mục 6; mọi page/feature dùng qua đây,
// không tự chế hiệu ứng riêng (xem client/DESIGN.md mục Motion system).
// LƯU Ý: PulseBar đã DEPRECATED từ v4 — không dùng cho trang nào nữa,
// export chỉ giữ để tương thích.
export { default as PageTransition, PAGE_EASE } from './PageTransition.jsx';
export { default as StaggerList, StaggerItem } from './StaggerList.jsx';
export { default as AnimatedNumber } from './AnimatedNumber.jsx';
export { default as ProgressRing } from './ProgressRing.jsx';
export { default as PulseBar } from './PulseBar.jsx';
export { default as CheckMotion } from './CheckMotion.jsx';
export { default as Drawer, SPRING_PANEL } from './Drawer.jsx';
export { default as ActivePill } from './ActivePill.jsx';
