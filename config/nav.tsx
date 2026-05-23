export type DashboardRole = "owner" | "admin" | "editor" | "viewer";

export const navItems = [
  {
    href: "/dashboard",
    label: { vi: "Tổng quan", en: "Dashboard" },
    icon: "D",
    roles: ["owner", "admin", "editor"] satisfies DashboardRole[],
  },
  {
    href: "/discover",
    label: { vi: "Khám phá", en: "Discover" },
    icon: "S",
    roles: ["owner", "admin", "editor"] satisfies DashboardRole[],
  },
  {
    href: "/selected",
    label: { vi: "Đã chọn", en: "Selected" },
    icon: "C",
    roles: ["owner", "admin", "editor", "viewer"] satisfies DashboardRole[],
  },
  {
    href: "/queue",
    label: { vi: "Hàng đợi", en: "Queue" },
    icon: "Q",
    roles: ["owner", "admin"] satisfies DashboardRole[],
  },
  {
    href: "/accounts",
    label: { vi: "Tài khoản", en: "Accounts" },
    icon: "A",
    roles: ["owner", "admin", "editor", "viewer"] satisfies DashboardRole[],
  },
  {
    href: "/automation",
    label: { vi: "Tự động", en: "Automation" },
    icon: "P",
    roles: ["owner", "admin", "editor", "viewer"] satisfies DashboardRole[],
  },
  {
    href: "/admin",
    label: { vi: "Quản trị", en: "Admin" },
    icon: "M",
    roles: ["owner", "admin"] satisfies DashboardRole[],
  },
];
