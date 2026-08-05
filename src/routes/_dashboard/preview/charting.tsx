import { createFileRoute } from '@tanstack/react-router';
import LineChart from '@/components/charting/LineChart';
import PieChart from '@/components/charting/PieChart';
import StackedBarChart from '@/components/charting/StackedBarChart';

type DemoDatum = {
  day: string;
  apples: number;
  bananas: number;
  cherries?: number;
  test?: number;
};

const demoData: DemoDatum[] = [
  { day: 'Mon', apples: 120, bananas: 80 },
  { day: 'Tue', apples: 90, bananas: 60 },
  { day: 'Wed', apples: 70, bananas: 120 },
  { day: 'Thu', apples: 100, bananas: 40 },
  { day: 'Fri', apples: 60, bananas: 110 },
  { day: 'Sat', apples: 140, bananas: 70 },
  { day: 'Test', apples: 110, bananas: 90, cherries: 1, test: -10 },
];

const revenueData = [
  { date: '2025-09-01', billable: 592.94, relevant: 1500.01, not_billable: 0 },
  { date: '2025-09-02', billable: 820.5, relevant: 1200.75, not_billable: 200.0 },
  { date: '2025-09-03', billable: 1025.0, relevant: 1350.2, not_billable: 50.0 },
  { date: '2025-09-04', billable: 740.33, relevant: 1600.0, not_billable: 0 },
  { date: '2025-09-05', billable: 910.12, relevant: 1450.5, not_billable: 0.0 },
  { date: '2025-09-06', billable: 660.0, relevant: 1100.1, not_billable: 0.0 },
  { date: '2025-09-07', billable: 1200.45, relevant: 1700.8, not_billable: 0 },
];

const utilizationRaw = [
  {
    employee: 'Alice',
    months: [
      { month: '2025-07', billable: 120 },
      { month: '2025-08', billable: 140 },
      { month: '2025-09', billable: 110 },
    ],
  },
  {
    employee: 'Bob',
    months: [
      { month: '2025-07', billable: 100 },
      { month: '2025-08', billable: 160 },
      { month: '2025-09', billable: 130 },
    ],
  },
  {
    employee: 'Charlie',
    months: [
      { month: '2025-07', billable: 135 },
      { month: '2025-08', billable: 125 },
      { month: '2025-09', billable: 145 },
    ],
  },
  {
    employee: 'Diana',
    months: [
      { month: '2025-07', billable: 110 },
      { month: '2025-08', billable: 150 },
      { month: '2025-09', billable: 120 },
    ],
  },
  {
    employee: 'Eva',
    months: [
      { month: '2025-07', billable: 95 },
      { month: '2025-08', billable: 115 },
      { month: '2025-09', billable: 155 },
    ],
  },
];

const utilizationChartData = (() => {
  const months = ['2025-07', '2025-08', '2025-09'];
  return months.map((month) => {
    const row: any = { category: month };
    utilizationRaw.forEach((emp) => {
      const monthInfo = emp.months.find((m) => m.month === month);
      if (monthInfo) {
        const total = monthInfo.billable + 30;
        row[emp.employee] = Math.round((monthInfo.billable / total) * 100);
      }
    });
    return row;
  });
})();

const marketShareData = [
  { category: 'Chrome', share: 65 },
  { category: 'Safari', share: 19 },
  { category: 'Firefox', share: 4 },
  { category: 'Edge', share: 5 },
  { category: 'Other', share: 7 },
];

const departmentData = [
  { category: 'Engineering', headcount: 45 },
  { category: 'Sales', headcount: 25 },
  { category: 'Marketing', headcount: 15 },
  { category: 'Operations', headcount: 10 },
  { category: 'HR', headcount: 5 },
];

const budgetAllocation = {
  category: 'Q4 2025',
  development: 450000,
  marketing: 180000,
  operations: 120000,
  infrastructure: 90000,
  training: 60000,
};

export const Route = createFileRoute('/_dashboard/preview/charting')({
  head: () => ({ meta: [{ title: 'Charting | LunaShare' }] }),
  component: ChartingPage,
});

function ChartingPage() {
  return (
    <section className="container mx-auto py-8">
      <h1 className="text-2xl font-bold">Charting Page</h1>
      <div className="mt-6">
        <StackedBarChart
          data={demoData.map((d) => ({ category: d.day, apples: d.apples, bananas: d.bananas, cherries: d.cherries, test: d.test }))}
          stacked={false}
          showLegend
          isLegendInteractive
          summarizeTooltip={false}
          markers={[
            { type: 'line', axis: 'value', value: 95, color: '#aa4000', width: 2, legend: 'Simple API', legendPosition: 'middle' },
            {
              type: 'line',
              axis: 'y',
              value: 70,
              legend: 'Full Nivo API',
              legendPosition: 'top-left',
              legendOrientation: 'horizontal',
              legendOffset: 20,
              legendOffsetX: 10,
              lineStyle: { stroke: '#8b5cf6', strokeWidth: 3, strokeDasharray: '5 5' },
              textStyle: { fill: '#8b5cf6', fontSize: 14, fontWeight: 'bold' },
            },
            { type: 'dot', index: 'Tue', value: 85, color: '#10b981', radius: 5, title: 'Peak', titleOffsetX: 5, titleOffsetY: -10 },
          ]}
        />

        <div className="mt-10" />

        <LineChart
          data={revenueData.map((r) => ({ category: r.date, billable: r.billable, relevant: r.relevant, not_billable: r.not_billable }))}
          formatIndex={(v) => new Date(String(v)).toLocaleDateString('de-DE')}
          formatValue={(n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          showLegend
          curve="monotoneX"
          pointSize={7}
          summarizeTooltip
          showPointLabels
          pointLabel="yFormatted"
          pointLabelYOffset={-12}
          crosshairColor="#0ea5e9"
          crosshairWidth={2}
          hoverBandColor="rgba(14,165,233,0.08)"
          pointLabelSeriesOffset={6}
          xAxisLabel="Datum"
          height={300}
          seriesColors={{ not_billable: '#6b7280', relevant: '#f97316', billable: '#22c55e' }}
        />

        <div className="mt-10" />

        <h2 className="text-xl font-semibold mb-4">Employee Utilization (Auslastung) per Month</h2>
        <StackedBarChart
          data={utilizationChartData}
          stacked={false}
          showLegend
          isLegendInteractive
          summarizeTooltip
          showTotals
          formatValue={(n) => `${n}%`}
          formatIndex={(v) => {
            const monthMap: Record<string, string> = {
              '2025-07': 'Juli 2025',
              '2025-08': 'August 2025',
              '2025-09': 'September 2025',
            };
            return monthMap[String(v)] || String(v);
          }}
          height={500}
          padding={0.2}
          innerPadding={2}
          borderRadius={4}
          borderWidth={1}
          enableLabel
          labelSkipWidth={20}
          labelSkipHeight={20}
          labelTextColor="rgba(255, 255, 255, 0.9)"
          axisBottom={{ tickSize: 0, tickPadding: 12, tickRotation: 0, legendOffset: 40 }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 10,
            tickRotation: 0,
            legend: 'Auslastung (%)',
            legendPosition: 'middle',
            legendOffset: -50,
            format: (v) => `${v}%`,
          }}
          seriesColors={{ Alice: '#3b82f6', Bob: '#10b981', Charlie: '#f59e0b', Diana: '#8b5cf6', Eva: '#ef4444' }}
          markers={[
            {
              type: 'line',
              axis: 'value',
              value: 75,
              color: '#16a34a',
              width: 2,
              legend: 'Target Utilization (75%)',
              legendPosition: 'end',
            },
            {
              type: 'line',
              axis: 'y',
              value: 50,
              legend: 'Minimum Utilization (50%)',
              legendPosition: 'top-left',
              legendOrientation: 'horizontal',
              legendOffset: 10,
              lineStyle: { stroke: '#dc2626', strokeWidth: 1, strokeDasharray: '4 4' },
              textStyle: { fill: '#dc2626', fontSize: 12 },
            },
          ]}
        />

        <div className="mt-10" />

        <h2 className="text-xl font-semibold mb-4">Pie Charts</h2>

        <h3 className="text-lg font-medium mb-2">Basic Pie Chart - Browser Market Share</h3>
        <PieChart
          data={marketShareData}
          showLegend
          isLegendInteractive
          formatValue={(n) => `${n}%`}
          height={400}
        />

        <div className="mt-10" />

        <h3 className="text-lg font-medium mb-2">Donut Chart with Center Label - Department Headcount</h3>
        <PieChart
          data={departmentData}
          innerRadius={0.5}
          cornerRadius={4}
          padAngle={0.7}
          showLegend
          isLegendInteractive
          enableArcLabels
          arcLabelsSkipAngle={10}
          centerLabel={({ formattedTotal }) => (
            <text
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 28, fontWeight: 700, fill: 'currentColor' }}
            >
              {formattedTotal}
            </text>
          )}
          height={400}
        />

        <div className="mt-10" />

        <h3 className="text-lg font-medium mb-2">Multi-Series Pie - Budget Allocation</h3>
        <PieChart
          data={[budgetAllocation]}
          formatValue={(n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          showLegend
          isLegendInteractive
          innerRadius={0.4}
          padAngle={0.5}
          cornerRadius={3}
          enableArcLinkLabels
          arcLinkLabelsSkipAngle={10}
          arcLinkLabelsDiagonalLength={20}
          arcLinkLabelsStraightLength={16}
          seriesColors={{
            development: '#3b82f6',
            marketing: '#f59e0b',
            operations: '#10b981',
            infrastructure: '#8b5cf6',
            training: '#ec4899',
          }}
          height={450}
        />

        <div className="mt-10" />

        <h3 className="text-lg font-medium mb-2">Revenue Distribution (Day 1)</h3>
        <PieChart
          data={[revenueData[0]!]}
          formatValue={(n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          showLegend
          isLegendInteractive
          innerRadius={0.6}
          enableArcLabels
          arcLabel="formattedValue"
          arcLabelsSkipAngle={15}
          enableArcLinkLabels={false}
          summarizeTooltip
          seriesColors={{ not_billable: '#6b7280', relevant: '#f97316', billable: '#22c55e' }}
          centerLabel={({ formattedTotal }) => (
            <>
              <text
                textAnchor="middle"
                y={-8}
                style={{ fontSize: 12, fill: 'currentColor', opacity: 0.7 }}
              >
                Total
              </text>
              <text
                textAnchor="middle"
                y={14}
                style={{ fontSize: 20, fontWeight: 600, fill: 'currentColor' }}
              >
                {formattedTotal}
              </text>
            </>
          )}
          height={400}
        />

        <div className="mt-10" />

        <h3 className="text-lg font-medium mb-2">Interactive Pie with Hover Effects</h3>
        <PieChart
          data={marketShareData}
          showLegend
          isLegendInteractive
          sortByValue
          innerRadius={0.3}
          activeOuterRadiusOffset={12}
          activeInnerRadiusOffset={4}
          enableArcLabels={false}
          enableArcLinkLabels
          arcLinkLabel="id"
          arcLinkLabelsOffset={2}
          arcLinkLabelsDiagonalLength={24}
          arcLinkLabelsStraightLength={32}
          arcLinkLabelsThickness={2}
          formatValue={(n) => `${n}%`}
          height={450}
        />
      </div>
    </section>
  );
}
