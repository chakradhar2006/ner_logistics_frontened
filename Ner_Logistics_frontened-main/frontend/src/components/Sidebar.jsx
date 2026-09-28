import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import sidebarHtml from '../fragments/sidebar.html?raw';

const PATH_TO_PAGE = {
  '/dashboard': 'dashboard',
  '/roads': 'roads',
  '/vehicles': 'vehicles',
  '/route-optimization': 'routeopt',
  '/velocity': 'velocity',
  '/weather': 'weather',
  '/profile': 'profile',
  '/settings': 'settings',
  '/report': 'report',
  '/sync': 'sync',
  '/alerts': 'alerts',
  '/deliveries': 'deliveries',
  '/reports': 'reports',
};

export default function Sidebar() {
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => {
    if (!ref.current) return;
    const page = PATH_TO_PAGE[location.pathname];
    ref.current.querySelectorAll('.side-link').forEach((link) => {
      link.classList.toggle('active', link.dataset.page === page);
    });
  }, [location.pathname]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: sidebarHtml }} />;
}
