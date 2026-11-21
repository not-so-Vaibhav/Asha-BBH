import { useEffect, useState, type AnchorHTMLAttributes } from 'react';

export function getCurrentLocation() {
  if (typeof window === 'undefined') return { pathname: '/', search: '' };
  return { pathname: window.location.pathname || '/', search: window.location.search || '' };
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  if (typeof window === 'undefined') return;
  if (options.replace) {
    window.history.replaceState({}, '', to);
  } else {
    window.history.pushState({}, '', to);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function useRouterLocation() {
  const [loc, setLoc] = useState(getCurrentLocation);

  useEffect(() => {
    const onPop = () => setLoc(getCurrentLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return loc;
}

export function getNextParam(search: string, fallback = '/app'): string {
  const raw = new URLSearchParams(search).get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  replace?: boolean;
};

export function RouterLink({ to, replace, onClick, ...rest }: LinkProps) {
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to, { replace });
      }}
      {...rest}
    />
  );
}
