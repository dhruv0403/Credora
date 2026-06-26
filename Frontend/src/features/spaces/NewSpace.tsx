import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { spaceSchema } from '@/schemas/space.schema';
import type { SpaceInput } from '@/schemas/space.schema';
import { createSpace } from '@/api/spaces';
import { useSpace } from '@/app/SpaceContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WizardStepper } from '@/components/shared/WizardStepper';
import { ServerMessage } from '@/components/shared/ServerMessage';
import { Briefcase, User, Eye, Users, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const NewSpace: React.FC = () => {
  const navigate = useNavigate();
  const { refreshSpaces, switchSpace } = useSpace();
  const [step, setStep] = useState(1);
  const [serverError, setServerError] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<SpaceInput>({
    resolver: zodResolver(spaceSchema),
    defaultValues: {
      space_type: 'PERSONAL',
      space_visibility: 'PRIVATE',
      currency_code: 'INR',
      name: '',
    },
    mode: 'onChange',
  });

  const spaceType = watch('space_type');
  const spaceVisibility = watch('space_visibility');

  const getExplanationSentence = () => {
    if (spaceType === 'PERSONAL' && spaceVisibility === 'PRIVATE') {
      return 'Personal + Private → A private ledger book for tracking your own individual loans and borrowing.';
    }
    if (spaceType === 'PERSONAL' && spaceVisibility === 'SHARED') {
      return 'Personal + Shared → A joint ledger shared with family/friends, but without partnership capital tracking.';
    }
    if (spaceType === 'BUSINESS' && spaceVisibility === 'PRIVATE') {
      return 'Business + Private → A commercial ledger for sole proprietors, without partner profit splits.';
    }
    if (spaceType === 'BUSINESS' && spaceVisibility === 'SHARED') {
      return 'Business + Shared → Full partnership ledger. Tracks member capital contributions, withdrawals, and profit splits.';
    }
    return '';
  };

  const onSubmit = async (data: SpaceInput) => {
    setIsLoading(true);
    setServerError(null);
    try {
      const space = await createSpace(data);
      toast.success('Space created successfully!');
      
      // Load the new space context
      await refreshSpaces();
      await switchSpace(space.id);

      if (data.space_visibility === 'SHARED') {
        // Prompt user to invite teammates
        toast('Invite teammates now?', {
          action: {
            label: 'Invite',
            onClick: () => navigate(`/spaces/${space.id}/members`),
          },
          duration: 10000,
        });
      }

      navigate(`/spaces/${space.id}/dashboard`);
    } catch (err: any) {
      setServerError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8 bg-paper border border-slate/15 p-8 rounded-md shadow-sm">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-serif text-3xl font-bold text-ink relative inline-block">
            Create a New Space
            <span className="absolute bottom-0 left-0 w-8 h-1 bg-brass translate-y-1"></span>
          </h1>
          <p className="text-xs text-slate mt-3">
            Configure your ledger parameters below
          </p>
        </div>

        {/* Stepper */}
        <WizardStepper
          currentStep={step}
          totalSteps={2}
          labels={['Type & Visibility', 'Basic Information']}
        />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <ServerMessage error={serverError} />

          {/* STEP 1: Type & Visibility */}
          {step === 1 && (
            <div className="space-y-6 animate-fadeIn">
              {/* Space Type Selector */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-ink">Space Type</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => setValue('space_type', 'PERSONAL', { shouldValidate: true })}
                    className={`border p-4 rounded-md cursor-pointer transition-all flex items-start gap-3 ${
                      spaceType === 'PERSONAL'
                        ? 'border-brass bg-brass/5 shadow-sm'
                        : 'border-slate/30 hover:border-slate/50'
                    }`}
                  >
                    <User className={`w-5 h-5 mt-0.5 ${spaceType === 'PERSONAL' ? 'text-brass' : 'text-slate'}`} />
                    <div>
                      <p className="font-semibold text-sm text-ink">Personal</p>
                      <p className="text-[11px] text-slate mt-0.5">For individuals tracking personal loans or friendly borrowing.</p>
                    </div>
                  </div>

                  <div
                    onClick={() => setValue('space_type', 'BUSINESS', { shouldValidate: true })}
                    className={`border p-4 rounded-md cursor-pointer transition-all flex items-start gap-3 ${
                      spaceType === 'BUSINESS'
                        ? 'border-brass bg-brass/5 shadow-sm'
                        : 'border-slate/30 hover:border-slate/50'
                    }`}
                  >
                    <Briefcase className={`w-5 h-5 mt-0.5 ${spaceType === 'BUSINESS' ? 'text-brass' : 'text-slate'}`} />
                    <div>
                      <p className="font-semibold text-sm text-ink">Business</p>
                      <p className="text-[11px] text-slate mt-0.5">For commercial transactions, sole traders, or partnerships.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visibility Selector */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-ink">Visibility / Collaboration</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => setValue('space_visibility', 'PRIVATE', { shouldValidate: true })}
                    className={`border p-4 rounded-md cursor-pointer transition-all flex items-start gap-3 ${
                      spaceVisibility === 'PRIVATE'
                        ? 'border-brass bg-brass/5 shadow-sm'
                        : 'border-slate/30 hover:border-slate/50'
                    }`}
                  >
                    <Eye className={`w-5 h-5 mt-0.5 ${spaceVisibility === 'PRIVATE' ? 'text-brass' : 'text-slate'}`} />
                    <div>
                      <p className="font-semibold text-sm text-ink">Private</p>
                      <p className="text-[11px] text-slate mt-0.5">Only you can view and log transactions in this space.</p>
                    </div>
                  </div>

                  <div
                    onClick={() => setValue('space_visibility', 'SHARED', { shouldValidate: true })}
                    className={`border p-4 rounded-md cursor-pointer transition-all flex items-start gap-3 ${
                      spaceVisibility === 'SHARED'
                        ? 'border-brass bg-brass/5 shadow-sm'
                        : 'border-slate/30 hover:border-slate/50'
                    }`}
                  >
                    <Users className={`w-5 h-5 mt-0.5 ${spaceVisibility === 'SHARED' ? 'text-brass' : 'text-slate'}`} />
                    <div>
                      <p className="font-semibold text-sm text-ink">Shared</p>
                      <p className="text-[11px] text-slate mt-0.5">Invite partners, admins, or field collection agents.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview Sentence */}
              <div className="bg-slate/10 p-3.5 rounded-md border border-slate/15 text-xs font-medium text-ink">
                {getExplanationSentence()}
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  type="button"
                  onClick={() => setStep(2)}
                  className="bg-brass hover:bg-brass/90 text-paper font-semibold text-xs py-2 px-4 rounded flex items-center gap-1"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Basics */}
          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-4">
                {/* Space Name */}
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs font-semibold text-ink">
                    Space Name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="e.g., Credora Partners Fund"
                    className="text-sm bg-paper border-slate/30 text-ink focus-visible:ring-brass"
                    {...register('name')}
                  />
                  {errors.name && (
                    <p className="text-[11px] text-payable font-medium">{errors.name.message}</p>
                  )}
                </div>

                {/* Currency */}
                <div className="space-y-1">
                  <Label htmlFor="currency_code" className="text-xs font-semibold text-ink">
                    Currency Code (ISO 4217)
                  </Label>
                  <Input
                    id="currency_code"
                    type="text"
                    maxLength={3}
                    placeholder="INR"
                    className="text-sm bg-paper border-slate/30 text-ink focus-visible:ring-brass uppercase font-figures"
                    {...register('currency_code')}
                  />
                  {errors.currency_code && (
                    <p className="text-[11px] text-payable font-medium">{errors.currency_code.message}</p>
                  )}
                  <p className="text-[10px] text-slate font-medium mt-0.5">
                    Default currency used for numerical values inside this space.
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate/15">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="text-xs font-semibold border-slate/30 text-ink hover:bg-slate/5 flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !isValid}
                  className="bg-brass hover:bg-brass/90 text-paper font-semibold text-xs py-2 px-4 rounded flex items-center gap-1.5"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating Space...
                    </>
                  ) : (
                    'Create Space'
                  )}
                </Button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
