// Biểu đồ của trang Báo cáo — tách thành chunk riêng chỉ chứa recharts để
// ReportsPage nạp bằng React.lazy + DeferredMount: bảng số liệu hiện trước,
// biểu đồ tải sau khi trình duyệt rảnh. Animation đặt 400ms (trước đây để
// mặc định ~1500ms của recharts nên trông chậm).
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
import { formatVND } from '../../../lib/format';

export function HeadcountChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#EAECF0" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="departmentName"
          tick={{ fontSize: 12, fill: '#667085' }}
          axisLine={{ stroke: '#EAECF0' }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 12, fill: '#667085' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip formatter={(value) => [`${value} nhân viên`, 'Số nhân viên']} />
        <Bar
          dataKey="employeeCount"
          name="Số nhân viên"
          fill="#274FEA"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
          isAnimationActive
          animationDuration={400}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PayrollPieChart({ data, colors }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="totalCost"
          nameKey="departmentName"
          innerRadius={64}
          outerRadius={104}
          paddingAngle={2}
          stroke="#FFFFFF"
          isAnimationActive
          animationDuration={400}
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.departmentId ?? entry.departmentName}
              fill={colors[index % colors.length]}
            />
          ))}
        </Pie>
        <Tooltip formatter={(value, name) => [formatVND(value), name]} />
      </PieChart>
    </ResponsiveContainer>
  );
}
