import {
  LayoutDashboard,
  Users,
  Handshake,
  ShieldAlert,
  Sparkles,
  Settings,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Guests", url: "/guests", icon: Users },
  { title: "Partenaires", url: "/partners", icon: Handshake },
  { title: "AI Offers", url: "/ai-offers", icon: Sparkles },
  { title: "Anti-Churn", url: "/anti-churn", icon: ShieldAlert },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-warning via-primary to-room-training flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-primary-foreground font-bold text-[10px] tracking-wider">TV</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-semibold text-sm text-sidebar-foreground tracking-[0.08em]">TALENT VERSE</h1>
              <p className="text-[10px] text-muted-foreground">Intelligence Platform</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="text-[10px] text-muted-foreground text-center">
            TalentVerse Internal v1.0
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
