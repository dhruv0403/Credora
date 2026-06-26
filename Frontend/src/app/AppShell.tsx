import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useSpace } from './SpaceContext';
import { getMe } from '@/api/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  Receipt,
  Users2,
  ArrowLeftRight,
  Calculator,
  FileText,
  BarChart3,
  Handshake,
  History,
  Users,
  Settings,
  ChevronDown,
  Menu,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';

export const AppShell: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { currentSpace, currentRole, spaces, switchSpace, refreshSpaces, setSpaceState } = useSpace();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userName, setUserName] = useState('User');

  useEffect(() => {
    // Listen to token refresh expiry logout events
    const handleLogoutEvent = () => {
      toast.error('Session expired. Please log in again.');
      setSpaceState(null, null);
      navigate('/login');
    };
    window.addEventListener('auth-logout', handleLogoutEvent);

    // Fetch user details
    getMe()
      .then((me) => setUserName(me.display_name))
      .catch(() => {});

    // Refresh spaces list
    refreshSpaces();

    return () => {
      window.removeEventListener('auth-logout', handleLogoutEvent);
    };
  }, []);

  const handleSpaceSwitch = async (id: number) => {
    try {
      await switchSpace(id);
      toast.success('Switched space');
      navigate(`/spaces/${id}/dashboard`);
    } catch (e) {
      toast.error('Failed to switch space');
    }
  };

  const navItems = [
    {
      label: 'Dashboard',
      path: `dashboard`,
      icon: <LayoutDashboard className="w-4 h-4" />,
      roles: ['OWNER', 'ADMIN', 'VIEWER'],
    },
    {
      label: 'Loans',
      path: `loans`,
      icon: <Receipt className="w-4 h-4" />,
      roles: ['OWNER', 'ADMIN', 'VIEWER', 'FIELDMAN'],
    },
    {
      label: 'Contacts',
      path: `contacts`,
      icon: <Users2 className="w-4 h-4" />,
      roles: ['OWNER', 'ADMIN', 'VIEWER', 'FIELDMAN'],
    },
    {
      label: 'Transactions',
      path: `transactions`,
      icon: <ArrowLeftRight className="w-4 h-4" />,
      roles: ['OWNER', 'ADMIN', 'VIEWER'],
    },
    {
      label: 'Expenses',
      path: `expenses`,
      icon: <Calculator className="w-4 h-4" />,
      roles: ['OWNER', 'ADMIN', 'VIEWER'],
    },
    {
      label: 'Reports',
      path: `reports`,
      icon: <FileText className="w-4 h-4" />,
      roles: ['OWNER', 'ADMIN', 'VIEWER'],
    },
    {
      label: 'Analytics',
      path: `analytics`,
      icon: <BarChart3 className="w-4 h-4" />,
      roles: ['OWNER', 'ADMIN', 'VIEWER'],
    },
    {
      label: 'Partners',
      path: `partners`,
      icon: <Handshake className="w-4 h-4" />,
      roles: ['OWNER', 'ADMIN', 'VIEWER'],
      businessOnly: true,
    },
    {
      label: 'Activity',
      path: `activity`,
      icon: <History className="w-4 h-4" />,
      roles: ['OWNER', 'ADMIN', 'VIEWER'],
    },
    {
      label: 'Members',
      path: `members`,
      icon: <Users className="w-4 h-4" />,
      roles: ['OWNER'],
    },
    {
      label: 'Settings',
      path: `settings`,
      icon: <Settings className="w-4 h-4" />,
      roles: ['OWNER'],
    },
  ];

  // Filter nav items based on user role and space type
  const activeNavItems = navItems.filter((item) => {
    // 1. Role check
    if (currentRole && !item.roles.includes(currentRole)) return false;

    // 2. Space type check
    if (item.businessOnly && currentSpace?.space_type !== 'BUSINESS') return false;

    return true;
  });

  const getPageTitle = () => {
    const activeItem = activeNavItems.find((item) => location.pathname.endsWith(item.path));
    return activeItem ? activeItem.label : 'Credora';
  };

  return (
    <div className="min-h-screen flex bg-paper text-ink">
      {/* Desktop left sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-slate/15 bg-paper p-4 justify-between h-screen sticky top-0">
        <div className="space-y-6">
          {/* Logo */}
          <div className="px-2 py-1">
            <Link to="/spaces" className="font-serif text-2xl font-bold tracking-tight text-ink relative inline-block">
              Credora
              <span className="absolute bottom-0 left-0 w-6 h-0.5 bg-brass translate-y-0.5"></span>
            </Link>
          </div>

          {/* Space Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2 border border-slate/15 rounded-md hover:bg-slate/5 transition-all text-left">
                <div className="truncate pr-2">
                  <p className="text-[10px] text-slate font-semibold uppercase tracking-wider">Active Space</p>
                  <p className="font-bold text-sm truncate text-ink">{currentSpace?.name || 'Loading space...'}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-slate flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-paper border border-slate/15 shadow-md">
              <DropdownMenuLabel className="text-xs text-slate uppercase tracking-wider">Switch Space</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate/10" />
              {spaces.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => handleSpaceSwitch(s.id)}
                  className={`cursor-pointer text-xs font-semibold py-2 ${
                    s.id === currentSpace?.id ? 'text-brass bg-brass/5' : 'text-ink'
                  }`}
                >
                  {s.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-slate/10" />
              <DropdownMenuItem
                onClick={() => navigate('/spaces/new')}
                className="cursor-pointer text-xs font-semibold text-brass focus:text-brass py-2"
              >
                + Create New Space
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate('/spaces')}
                className="cursor-pointer text-xs font-semibold text-slate py-2"
              >
                View All Spaces
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Nav Items */}
          <nav className="space-y-1">
            {activeNavItems.map((item) => {
              const isActive = location.pathname.includes(item.path);
              return (
                <Link
                  key={item.label}
                  to={`/spaces/${spaceId}/${item.path}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold transition-all relative ${
                    isActive
                      ? 'text-brass bg-brass/5 font-bold'
                      : 'text-slate hover:text-ink hover:bg-slate/5'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/4 bottom-1/4 w-0.5 bg-brass rounded-r" />
                  )}
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile section */}
        <div className="border-t border-slate/15 pt-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-8 h-8 rounded-full bg-brass/10 border border-brass/20 flex items-center justify-center text-brass font-bold text-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-ink truncate">{userName}</p>
                <p className="text-[10px] text-slate font-medium capitalize truncate">
                  {currentRole?.toLowerCase()}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/spaces')}
              className="text-slate hover:text-payable p-1.5 rounded-md hover:bg-slate/5 transition-colors"
              title="All Spaces"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="lg:hidden flex items-center justify-between h-14 border-b border-slate/15 bg-paper px-4 sticky top-0 z-40">
          <Link to="/spaces" className="font-serif text-xl font-bold tracking-tight text-ink">
            Credora
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate border border-slate/20 px-2 py-0.5 rounded-full uppercase bg-slate/5">
              {currentSpace?.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-ink hover:bg-slate/5"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Mobile Dropdown Menu Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
            <div
              className="w-64 bg-paper h-full p-4 flex flex-col justify-between shadow-xl animate-slideRight"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-6">
                <div className="font-serif text-xl font-bold text-ink">
                  Credora Menu
                </div>
                <nav className="space-y-1.5">
                  {activeNavItems.map((item) => (
                    <Link
                      key={item.label}
                      to={`/spaces/${spaceId}/${item.path}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-semibold text-slate hover:text-ink hover:bg-slate/5"
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
              <div className="border-t border-slate/15 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/spaces');
                  }}
                  className="w-full text-xs font-semibold justify-center gap-1.5 border-slate/30"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Switch Space
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Page title and content wrapper */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
          {/* Page breadcrumb header */}
          <div className="hidden lg:block mb-6">
            <h2 className="font-serif text-2xl font-bold text-ink relative inline-block">
              {getPageTitle()}
              <span className="absolute bottom-0 left-0 w-6 h-0.5 bg-brass translate-y-0.5"></span>
            </h2>
          </div>

          <Outlet />
        </main>
      </div>
    </div>
  );
};
