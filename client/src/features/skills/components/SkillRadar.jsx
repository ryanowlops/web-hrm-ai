// Biểu đồ radar kỹ năng — tách thành chunk riêng chỉ chứa recharts để
// SkillsPage nạp bằng React.lazy + DeferredMount (như Dashboard/Reports):
// nội dung chính hiện trước, biểu đồ tải sau khi trình duyệt rảnh.
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

// data: [{ skill: 'Python', level: 4 }] — thang 1..5.
export default function SkillRadar({ data }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#EAECF0" />
        <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12, fill: '#475467' }} />
        <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 11, fill: '#98A2B3' }} axisLine={false} />
        <Radar
          name="Mức kỹ năng"
          dataKey="level"
          stroke="#274FEA"
          fill="#274FEA"
          fillOpacity={0.22}
          isAnimationActive
          animationDuration={400}
        />
        <Tooltip formatter={(value) => [`Mức ${value}/5`, 'Năng lực']} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
