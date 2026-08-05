import { createFileRoute, Link } from '@tanstack/react-router';
import { adminDestinations } from '@/components/admin/admin-destinations';

export const Route = createFileRoute('/_admin/admin/')({
  head: () => ({ meta: [{ title: 'Admin | LunaShare' }] }),
  component: AdminIndexPage,
});

function AdminIndexPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {adminDestinations.map(({ name, to, Icon, bgColor, hoverBg, description }) => (
          <Link
            key={name}
            to={to}
            className={`${bgColor} ${hoverBg} p-6 rounded-lg shadow-md transition flex flex-col items-center justify-center text-white`}
          >
            <Icon className="h-8 w-8 mb-2" />
            <span className="text-lg font-semibold">{name}</span>
            <p className="mt-2 text-sm opacity-90">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
