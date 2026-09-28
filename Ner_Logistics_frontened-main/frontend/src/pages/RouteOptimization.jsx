import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-routeopt.html?raw';
import mobileHtml from '../fragments/mobile-routeopt.html?raw';

export default function RouteOptimization() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
