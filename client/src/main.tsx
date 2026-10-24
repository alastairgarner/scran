import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';

import { Account } from './screens/account';
import { Administration } from './screens/admin';
import { Invite, RequireAuth, SignIn } from './screens/auth';
import { Capture } from './screens/capture';
import { Catalogue } from './screens/catalogue';
import { Recipe } from './screens/recipe';
import { UiExamples } from './screens/ui-examples';

import './theme.css';

const queryClient = new QueryClient();

function Protected({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root is missing from index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route
            path="/ui"
            element={
              <Protected>
                <UiExamples />
              </Protected>
            }
          />
          <Route path="/invite/:token" element={<Invite />} />
          <Route
            path="/admin"
            element={
              <Protected>
                <Administration />
              </Protected>
            }
          />
          <Route
            path="/account"
            element={
              <Protected>
                <Account />
              </Protected>
            }
          />
          <Route
            path="/"
            element={
              <Protected>
                <Catalogue />
              </Protected>
            }
          />
          <Route
            path="/capture"
            element={
              <Protected>
                <Capture />
              </Protected>
            }
          />
          <Route
            path="/recipes/:id"
            element={
              <Protected>
                <Recipe />
              </Protected>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
