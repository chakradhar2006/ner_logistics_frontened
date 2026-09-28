import { useEffect, useRef } from 'react';
import { initPageBehaviors, populateAccountProfile } from '../legacy/legacy.js';
import desktopHtml from '../fragments/desktop-login.html?raw';
import mobileHtml from '../fragments/mobile-login.html?raw';

export default function Login() {
  const ref = useRef(null);

  useEffect(() => {
    initPageBehaviors(ref.current);
    populateAccountProfile();
  }, []);

  return (
    <div ref={ref}>
      <div className="desktop-only" dangerouslySetInnerHTML={{ __html: desktopHtml }} />
      <div className="mobile-only">
        <div className="mobile-screen auth-mobile-screen" dangerouslySetInnerHTML={{ __html: mobileHtml }} />
      </div>
    </div>
  );
}
