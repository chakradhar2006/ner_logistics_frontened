import { useEffect, useRef } from 'react';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { initPageBehaviors } from '../legacy/legacy.js';

/**
 * Renders the extracted desktop `app-content` markup inside the shared
 * sidebar/topbar shell, and the extracted mobile markup (which already
 * includes its own header + bottom nav) full-screen. Only one of the two
 * is visible at a time, controlled purely by CSS (see overrides.css).
 */
export default function PageShell({ desktopHtml, mobileHtml }) {
  const rootRef = useRef(null);

  useEffect(() => {
    initPageBehaviors(rootRef.current);
  }, [desktopHtml, mobileHtml]);

  return (
    <div ref={rootRef}>
      <div className="desktop-only">
        <div className="app-shell">
          <Sidebar />
          <div className="app-main">
            <Topbar />
            <div dangerouslySetInnerHTML={{ __html: desktopHtml }} />
          </div>
        </div>
      </div>
      <div className="mobile-only">
        <div className="mobile-screen" dangerouslySetInnerHTML={{ __html: mobileHtml }} />
      </div>
    </div>
  );
}
