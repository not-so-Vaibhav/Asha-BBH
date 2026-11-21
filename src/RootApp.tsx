import { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { navigate, useRouterLocation } from './router';
import './auth.css';

const LandingPage = lazy(() => import('./screens/LandingPage'));
const AuthScreens = lazy(() => import('./screens/AuthScreens'));
const PrivacyPage = lazy(() => import('./screens/PrivacyPage'));
const MainApp = lazy(() => import('./screens/App'));

function RouteLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#faf6ee',
        color: '#0b1f33',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 700,
      }}
      role="status"
      aria-live="polite"
    >
      Loading ASHA SAKHI…
    </div>
  );
}

function ProtectedWorkspace() {
  const { loading, isAuthenticated, needsOnboarding } = useAuth();
  const { pathname, search } = useRouterLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      const next = encodeURIComponent(`${pathname}${search}`);
      navigate(`/login?next=${next}`, { replace: true });
      return;
    }
    if (needsOnboarding) {
      navigate('/onboarding', { replace: true });
    }
  }, [loading, isAuthenticated, needsOnboarding, pathname, search]);

  if (loading || !isAuthenticated || needsOnboarding) {
    return <RouteLoader />;
  }

  return (
    <Suspense fallback={<RouteLoader />}>
      <MainApp />
    </Suspense>
  );
}

function OnboardingGate() {
  const { loading, isAuthenticated, needsOnboarding } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      navigate('/login?next=/onboarding', { replace: true });
      return;
    }
    if (!needsOnboarding) {
      navigate('/app', { replace: true });
    }
  }, [loading, isAuthenticated, needsOnboarding]);

  if (loading || !isAuthenticated) return <RouteLoader />;

  return (
    <Suspense fallback={<RouteLoader />}>
      <AuthScreens mode="onboarding" />
    </Suspense>
  );
}

function RouterView() {
  const { pathname } = useRouterLocation();

  if (pathname === '/' || pathname === '') {
    return (
      <Suspense fallback={<RouteLoader />}>
        <LandingPage />
      </Suspense>
    );
  }
  if (pathname === '/login') {
    return (
      <Suspense fallback={<RouteLoader />}>
        <AuthScreens mode="login" />
      </Suspense>
    );
  }
  if (pathname === '/signup') {
    return (
      <Suspense fallback={<RouteLoader />}>
        <AuthScreens mode="signup" />
      </Suspense>
    );
  }
  if (pathname === '/forgot') {
    return (
      <Suspense fallback={<RouteLoader />}>
        <AuthScreens mode="forgot" />
      </Suspense>
    );
  }
  if (pathname === '/reset') {
    return (
      <Suspense fallback={<RouteLoader />}>
        <AuthScreens mode="reset" />
      </Suspense>
    );
  }
  if (pathname === '/onboarding') {
    return <OnboardingGate />;
  }
  if (pathname === '/privacy') {
    return (
      <Suspense fallback={<RouteLoader />}>
        <PrivacyPage />
      </Suspense>
    );
  }
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return <ProtectedWorkspace />;
  }

  // Fallback unknown path -> landing
  return (
    <Suspense fallback={<RouteLoader />}>
      <LandingPage />
    </Suspense>
  );
}

export default function RootApp() {
  return (
    <AuthProvider>
      <RouterView />
    </AuthProvider>
  );
}
