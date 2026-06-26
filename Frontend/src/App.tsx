import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { Login } from '@/features/auth/Login';
import { Register } from '@/features/auth/Register';
import { SpacesLanding } from '@/features/spaces/SpacesLanding';
import { NewSpace } from '@/features/spaces/NewSpace';
import { AppShell } from '@/app/AppShell';
import { RequireRole } from '@/app/RequireRole';

// Core Screens
import { Dashboard } from '@/features/dashboard/Dashboard';
import { LoansList } from '@/features/loans/LoansList';
import { LoanDetail } from '@/features/loans/LoanDetail';
import { NewLoanWizard } from '@/features/loans/NewLoanWizard';

// Feature Stubs
import { ContactsList } from '@/features/contacts/ContactsList';
import { ContactDetail } from '@/features/contacts/ContactDetail';
import { TransactionsList } from '@/features/transactions/TransactionsList';
import { ExpensesList } from '@/features/expenses/ExpensesList';
import { ReportsDashboard } from '@/features/reports/ReportsDashboard';
import { AnalyticsDashboard } from '@/features/analytics/AnalyticsDashboard';
import { PartnersDashboard } from '@/features/partners/PartnersDashboard';
import { ActivityTimeline } from '@/features/activity/ActivityTimeline';
import { MembersManager } from '@/features/settings/MembersManager';
import { SpaceSettingsManager } from '@/features/settings/SpaceSettingsManager';

function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          {/* Auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Spaces landing hub */}
          <Route path="/spaces" element={<SpacesLanding />} />
          <Route path="/spaces/new" element={<NewSpace />} />

          {/* Scoped Space routes inside AppShell */}
          <Route path="/spaces/:spaceId" element={<AppShell />}>
            {/* Dashboard: OWNER, ADMIN, VIEWER */}
            <Route
              path="dashboard"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER']}>
                  <Dashboard />
                </RequireRole>
              }
            />
            {/* Loans list: OWNER, ADMIN, VIEWER, FIELDMAN */}
            <Route
              path="loans"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER', 'FIELDMAN']}>
                  <LoansList />
                </RequireRole>
              }
            />
            {/* New Loan: OWNER, ADMIN */}
            <Route
              path="loans/new"
              element={
                <RequireRole roles={['OWNER', 'ADMIN']}>
                  <NewLoanWizard />
                </RequireRole>
              }
            />
            {/* Loan details: OWNER, ADMIN, VIEWER, FIELDMAN */}
            <Route
              path="loans/:loanId"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER', 'FIELDMAN']}>
                  <LoanDetail />
                </RequireRole>
              }
            />
            {/* Contacts list */}
            <Route
              path="contacts"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER', 'FIELDMAN']}>
                  <ContactsList />
                </RequireRole>
              }
            />
            {/* Contact detail */}
            <Route
              path="contacts/:contactId"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER', 'FIELDMAN']}>
                  <ContactDetail />
                </RequireRole>
              }
            />
            {/* Transactions */}
            <Route
              path="transactions"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER']}>
                  <TransactionsList />
                </RequireRole>
              }
            />
            {/* Expenses */}
            <Route
              path="expenses"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER']}>
                  <ExpensesList />
                </RequireRole>
              }
            />
            {/* Reports */}
            <Route
              path="reports"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER']}>
                  <ReportsDashboard />
                </RequireRole>
              }
            />
            {/* Analytics */}
            <Route
              path="analytics"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER']}>
                  <AnalyticsDashboard />
                </RequireRole>
              }
            />
            {/* Partners */}
            <Route
              path="partners"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER']}>
                  <PartnersDashboard />
                </RequireRole>
              }
            />
            {/* Activity */}
            <Route
              path="activity"
              element={
                <RequireRole roles={['OWNER', 'ADMIN', 'VIEWER']}>
                  <ActivityTimeline />
                </RequireRole>
              }
            />
            {/* Members: OWNER only */}
            <Route
              path="members"
              element={
                <RequireRole roles={['OWNER']}>
                  <MembersManager />
                </RequireRole>
              }
            />
            {/* Settings: OWNER only */}
            <Route
              path="settings"
              element={
                <RequireRole roles={['OWNER']}>
                  <SpaceSettingsManager />
                </RequireRole>
              }
            />
            
            {/* Scoped fallback redirect */}
            <Route path="" element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Top-level catch-all redirect */}
          <Route path="*" element={<Navigate to="/spaces" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}

export default App;
