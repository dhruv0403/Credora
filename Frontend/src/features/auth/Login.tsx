import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@/schemas/auth.schema';
import type { LoginInput } from '@/schemas/auth.schema';
import { login } from '@/api/auth';
import { useSpace } from '@/app/SpaceContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ServerMessage } from '@/components/shared/ServerMessage';
import { KeyRound, Mail, Loader2 } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { refreshSpaces } = useSpace();
  const [serverError, setServerError] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    setServerError(null);
    try {
      const user = await login(data);
      await refreshSpaces();
      
      if (user.last_active_space_id) {
        navigate(`/spaces/${user.last_active_space_id}/dashboard`);
      } else {
        navigate('/spaces');
      }
    } catch (err: any) {
      setServerError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4 py-12">
      <div className="max-w-md w-full space-y-8 bg-paper border border-slate/15 p-8 rounded-md shadow-sm">
        <div className="text-center">
          <h1 className="font-serif text-4xl text-ink font-bold relative inline-block">
            Credora
            <span className="absolute bottom-0 left-0 w-8 h-1 bg-brass translate-y-1"></span>
          </h1>
          <p className="mt-4 text-xs text-slate font-medium uppercase tracking-wider">
            Ledger-driven Account Books
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <ServerMessage error={serverError} />

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-xs font-semibold text-ink">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  className="pl-10 text-sm bg-paper border-slate/30 text-ink focus-visible:ring-brass"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-[11px] text-payable font-medium">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="password" className="text-xs font-semibold text-ink">
                Password
              </Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-10 text-sm bg-paper border-slate/30 text-ink focus-visible:ring-brass"
                  {...register('password')}
                />
              </div>
              {errors.password && (
                <p className="text-[11px] text-payable font-medium">{errors.password.message}</p>
              )}
            </div>
          </div>

          <div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brass hover:bg-brass/90 text-paper font-semibold text-sm h-10 transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </div>

          <div className="text-center text-xs">
            <span className="text-slate">Don't have an account? </span>
            <Link to="/register" className="text-brass font-semibold hover:underline">
              Create an account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};
