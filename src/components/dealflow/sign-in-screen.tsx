'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSessionStore } from '@/store/session-store';
import { useViewStore } from '@/store/view-store';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  Loader2,
  LogIn,
  UserPlus,
  ArrowLeft,
  Mail,
  Lock,
  Phone,
  Building2,
  Briefcase,
  MapPin,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Role } from '@/store/session-store';

const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';

const DEMO_PROFILES: {
  email: string;
  name: string;
  role: Role;
  password: string;
}[] = [
  { email: 'alex@dealflow360.io', name: 'Alex Rivera', role: 'SALES_REP', password: DEMO_PASSWORD },
  { email: 'morgan@dealflow360.io', name: 'Morgan Chen', role: 'SALES_MANAGER', password: DEMO_PASSWORD },
  { email: 'finn@dealflow360.io', name: 'Finn Ops', role: 'FINANCE_OPERATIONS', password: DEMO_PASSWORD },
  { email: 'casey@acme.io', name: 'Casey Acme', role: 'CUSTOMER', password: DEMO_PASSWORD },
  { email: 'admin@dealflow360.io', name: 'Avery Admin', role: 'ADMIN', password: DEMO_PASSWORD },
];

type Mode = 'signin' | 'register';

export function SignInScreen() {
  const [mode, setMode] = useState<Mode>('signin');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-6 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/20">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white shadow-lg shadow-emerald-500/20">
          D360
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          DealFlow360
        </h1>
        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
          The deal lifecycle operating system — quotation, risk, approvals,
          fulfillment, billing and customer negotiation in one governed workflow.
        </p>
      </div>

      {mode === 'signin' ? (
        <SignInForm onSwitchToRegister={() => setMode('register')} />
      ) : (
        <RegisterForm onSwitchToSignIn={() => setMode('signin')} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sign-in form (existing behavior)
// ──────────────────────────────────────────────────────────────────────────

function SignInForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const setStatus = useSessionStore((s) => s.setStatus);
  const setView = useViewStore((s) => s.setView);
  const [email, setEmail] = useState('alex@dealflow360.io');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetch('/api/auth/seed-demo', { method: 'POST' });
      } catch {
        // ignore
      } finally {
        if (!cancelled) setSeeding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await signIn('credentials', { email, password, redirect: false });
      if (!res || res.error) {
        toast.error('Invalid email or password.');
        setLoading(false);
        return;
      }
      const sessRes = await fetch('/api/session');
      const sess = await sessRes.json();
      if (!sess.user) {
        toast.error('Failed to load session.');
        setLoading(false);
        return;
      }
      useSessionStore.getState().setUser(sess.user);
      useSessionStore.getState().setStatus('authenticated');
      setView(sess.user.role === 'CUSTOMER' ? 'portal' : 'dashboard');
      toast.success(`Welcome, ${sess.user.name.split(' ')[0]}.`);
    } catch {
      toast.error('Sign-in failed. Try a demo profile.');
      setLoading(false);
    }
  };

  const quickFill = (profile: (typeof DEMO_PROFILES)[number]) => {
    setEmail(profile.email);
    setPassword(profile.password);
  };

  return (
    <>
      <Card className="w-full max-w-md border-slate-200 shadow-xl dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-base">Sign in</CardTitle>
          <CardDescription>
            Use the form below or pick a demo profile. All demo passwords are
            <span className="ml-1 font-mono text-xs">{DEMO_PASSWORD}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={seeding}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={seeding}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || seeding}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                or quick fill a demo profile
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {DEMO_PROFILES.map((p) => (
              <button
                key={p.email}
                type="button"
                onClick={() => quickFill(p)}
                disabled={seeding}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50/40 hover:shadow-sm disabled:opacity-60',
                  'dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30',
                )}
              >
                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-semibold text-white dark:from-slate-200 dark:to-slate-400 dark:text-slate-900">
                  {p.name[0]}
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {p.name}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {p.email}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {p.role.replace('_', ' ')}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        New to DealFlow360?{' '}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Create an account →
        </button>
      </p>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Register form (new)
// ──────────────────────────────────────────────────────────────────────────

function RegisterForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState<Role>('SALES_REP');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    if (!agreeToTerms) {
      toast.error('Please agree to the Terms of Service.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
          phone: phone || undefined,
          company: company || undefined,
          jobTitle: jobTitle || undefined,
          country: country || undefined,
          city: city || undefined,
          address: address || undefined,
          zipCode: zipCode || undefined,
          agreeToTerms,
          marketingOptIn,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? 'Registration failed');
      }
      toast.success(`Account created for ${json.user.name}. You can now sign in.`);
      onSwitchToSignIn();
      // Pre-fill the sign-in form via window location reload hack
      setTimeout(() => {
        const emailInput = document.getElementById('email') as HTMLInputElement | null;
        if (emailInput) {
          emailInput.value = email;
          const pwdInput = document.getElementById('password') as HTMLInputElement | null;
          if (pwdInput) pwdInput.value = password;
        }
      }, 100);
    } catch (err: any) {
      toast.error(err.message || 'Registration failed.');
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="w-full max-w-2xl border-slate-200 shadow-xl dark:border-slate-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSwitchToSignIn}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Back to sign in"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <CardTitle className="text-base">Create your account</CardTitle>
              <CardDescription>
                Your details are saved in our dedicated registration database.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account section */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Account
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="fullName" label="Full name" icon={UserPlus} required>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    autoComplete="name"
                    required
                  />
                </Field>
                <Field id="email" label="Email" icon={Mail} required>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@example.com"
                    autoComplete="email"
                    required
                  />
                </Field>
                <Field id="password" label="Password" icon={Lock} required>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                  />
                </Field>
                <Field id="confirmPassword" label="Confirm password" icon={Lock} required>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type password"
                    autoComplete="new-password"
                    required
                  />
                </Field>
              </div>
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALES_REP">Sales Representative</SelectItem>
                  <SelectItem value="SALES_MANAGER">Sales Manager</SelectItem>
                  <SelectItem value="FINANCE_OPERATIONS">Finance / Operations</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                Choose the role that fits you. An admin can change it later.
              </p>
            </div>

            {/* Profile section */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Profile (optional)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="phone" label="Phone" icon={Phone}>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                  />
                </Field>
                <Field id="company" label="Company" icon={Building2}>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Corp"
                    autoComplete="organization"
                  />
                </Field>
                <Field id="jobTitle" label="Job title" icon={Briefcase}>
                  <Input
                    id="jobTitle"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Sales Director"
                    autoComplete="organization-title"
                  />
                </Field>
                <Field id="country" label="Country" icon={Globe}>
                  <Input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="India"
                    autoComplete="country-name"
                  />
                </Field>
                <Field id="city" label="City" icon={MapPin}>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Mumbai"
                    autoComplete="address-level2"
                  />
                </Field>
                <Field id="zipCode" label="ZIP / Postal code" icon={MapPin}>
                  <Input
                    id="zipCode"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="400001"
                    autoComplete="postal-code"
                  />
                </Field>
              </div>
              <Field id="address" label="Address" icon={MapPin}>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 MG Road, Andheri East"
                  autoComplete="street-address"
                />
              </Field>
            </div>

            {/* Consent */}
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={agreeToTerms}
                  onCheckedChange={(v) => setAgreeToTerms(v === true)}
                  className="mt-0.5"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  I agree to the{' '}
                  <a href="#" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="#" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={marketingOptIn}
                  onCheckedChange={(v) => setMarketingOptIn(v === true)}
                  className="mt-0.5"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  Send me product updates and DealFlow360 news (optional).
                </span>
              </label>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !fullName || !email || !password || !agreeToTerms}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          Sign in →
        </button>
      </p>
    </>
  );
}

function Field({
  id,
  label,
  icon: Icon,
  required,
  children,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        {label}
        {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
    </div>
  );
}
