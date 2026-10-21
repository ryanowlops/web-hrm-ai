// Biểu đồ của trang Dashboard — tách thành chunk riêng chỉ chứa recharts
// (~109KB gzip) để DashboardPage nạp bằng React.lazy + DeferredMount:
// trang hiện khung + thẻ số liệu trước, biểu đồ tải sau khi trình duyệt rảnh.
// Màu phẳng theo hợp đồng v4 (fill đặc, không gradient), animation rút từ
// 800ms xuống 400ms cho cảm giác nhanh gọn.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const ATTENDANCE_COLORS = {
  'Đúng giờ': '#274FEA',
  'Đi muộn': '#F59E0B',
  'Nghỉ phép': '#0DB795',
  Vắng: '#D0D5DD',
};
const DEPARTMENT_COLORS = ['#274FEA', '#0DB795', '#F59E0B', '#98A2B3', '#667085', '#D0D5DD'];

export function AttendanceChart({ data }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#EAECF0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#667085' }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#667085' }} />
        <Tooltip formatter={(value) => [`${value} người`, 'Số lượng']} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={400}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={ATTENDANCE_COLORS[entry.name] || '#274FEA'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DepartmentChart({ data }) {
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={56}
          outerRadius={88}
          paddingAngle={1}
          isAnimationActive
          animationDuration={400}
          label={({ name, value }) => `${name}: ${value}`}
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => [`${value} nhân viên`, 'Số lượng']} />
      </PieChart>
    </ResponsiveContainer>
  );
}
