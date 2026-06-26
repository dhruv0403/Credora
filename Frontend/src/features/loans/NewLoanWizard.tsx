import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loanSchema } from '@/schemas/loan.schema';
import { createLoan } from '@/api/loans';
import { listContacts } from '@/api/contacts';
import type { Contact } from '@/api/contacts';
import { WizardStepper } from '@/components/shared/WizardStepper';
import { ServerMessage } from '@/components/shared/ServerMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatCurrency';

const STEPS = [
  'Who & Direction',
  'Principal & Dates',
  'Interest Config',
  'Repayment Config',
  'Advance & Penalty',
  'Review & Submit',
];

export const NewLoanWizard: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const parsedSpaceId = Number(spaceId);
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [serverError, setServerError] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const methods = useForm<any>({
    resolver: zodResolver(loanSchema) as any,
    defaultValues: {
      direction: 'GIVEN',
      interest_type: 'NONE',
      interest_timing: 'PAYABLE_PERIODICALLY',
      interest_rate_behavior: 'FIXED',
      repayment_type: 'ONE_TIME',
      payment_timing_rule: 'SCHEDULED',
      penalty_type: 'NONE',
      grace_period_days: 0,
    },
    mode: 'onChange',
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = methods;

  // Watch key values for conditional layouts
  const direction = watch('direction');
  const interestType = watch('interest_type');
  const interestTiming = watch('interest_timing');
  const repaymentType = watch('repayment_type');
  const penaltyType = watch('penalty_type');

  useEffect(() => {
    // Fetch contacts list for Step 1 search
    setIsLoadingContacts(true);
    listContacts(parsedSpaceId)
      .then((data) => setContacts(data))
      .catch(() => {})
      .finally(() => setIsLoadingContacts(false));
  }, [parsedSpaceId]);

  const handleNext = async () => {
    // Move to next step
    if (step < STEPS.length) {
      setStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => prev - 1);
    }
  };

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const result = await createLoan(parsedSpaceId, data);
      toast.success('Loan created as DRAFT!');
      navigate(`/spaces/${spaceId}/loans/${result.id}`);
    } catch (err: any) {
      setServerError(err);
      toast.error('Failed to create loan');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 bg-paper border border-slate/15 p-6 rounded-md shadow-sm">
      <div className="flex justify-between items-center pb-3 border-b border-slate/10">
        <div>
          <h2 className="font-serif text-xl font-bold text-ink">Record Loan</h2>
          <p className="text-[10px] text-slate mt-0.5 font-medium">Record a lending or borrowing contract</p>
        </div>
      </div>

      <WizardStepper currentStep={step} totalSteps={6} labels={STEPS} />

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
          <ServerMessage error={serverError} />

          {/* STEP 1: Who & Direction */}
          {step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-ink">Loan Direction</Label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setValue('direction', 'GIVEN')}
                    className={`p-3 border rounded-md text-xs font-semibold ${
                      direction === 'GIVEN'
                        ? 'border-brass bg-brass/5 text-brass'
                        : 'border-slate/30 text-ink'
                    }`}
                  >
                    Lent (Given to Partner)
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue('direction', 'TAKEN')}
                    className={`p-3 border rounded-md text-xs font-semibold ${
                      direction === 'TAKEN'
                        ? 'border-brass bg-brass/5 text-brass'
                        : 'border-slate/30 text-ink'
                    }`}
                  >
                    Borrowed (Taken by User)
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-ink">Contact Person</Label>
                {isLoadingContacts ? (
                  <div className="h-10 bg-slate/5 rounded-md animate-pulse" />
                ) : (
                  <Select onValueChange={(val: string) => setValue('contact_id', Number(val))}>
                    <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm">
                      <SelectValue placeholder="Select contact..." />
                    </SelectTrigger>
                    <SelectContent className="bg-paper border-slate/15 text-ink">
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()} className="text-xs">
                          {c.name} ({c.relationship_tag})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.contact_id && (
                  <p className="text-[10px] text-payable font-medium">{errors.contact_id.message as string}</p>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Principal & Dates */}
          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-1">
                <Label htmlFor="principal_amount" className="text-xs font-semibold text-ink">Principal Amount</Label>
                <Input
                  id="principal_amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="bg-paper border-slate/30 text-ink text-sm"
                  {...register('principal_amount')}
                />
                {errors.principal_amount && (
                  <p className="text-[10px] text-payable font-medium">{errors.principal_amount.message as string}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="start_date" className="text-xs font-semibold text-ink">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    className="bg-paper border-slate/30 text-ink text-sm"
                    {...register('start_date')}
                  />
                  {errors.start_date && (
                    <p className="text-[10px] text-payable font-medium">{errors.start_date.message as string}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="first_due_date" className="text-xs font-semibold text-ink">First Due Date</Label>
                  <Input
                    id="first_due_date"
                    type="date"
                    className="bg-paper border-slate/30 text-ink text-sm"
                    {...register('first_due_date')}
                  />
                  {errors.first_due_date && (
                    <p className="text-[10px] text-payable font-medium">{errors.first_due_date.message as string}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="tenure_periods" className="text-xs font-semibold text-ink">Tenure Periods (Count)</Label>
                <Input
                  id="tenure_periods"
                  type="number"
                  placeholder="12"
                  className="bg-paper border-slate/30 text-ink text-sm"
                  {...register('tenure_periods')}
                />
                {errors.tenure_periods && (
                  <p className="text-[10px] text-payable font-medium">{errors.tenure_periods.message as string}</p>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Interest Config */}
          {step === 3 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ink">Interest Type</Label>
                  <Select 
                    value={interestType}
                    onValueChange={(val: string) => {
                      setValue('interest_type', val as any);
                      if (val === 'NONE') setValue('rate_value', 0);
                    }}
                  >
                    <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm">
                      <SelectValue placeholder="Interest type..." />
                    </SelectTrigger>
                    <SelectContent className="bg-paper border-slate/15 text-ink">
                      <SelectItem value="NONE" className="text-xs">None (Interest Free)</SelectItem>
                      <SelectItem value="FIXED" className="text-xs">Fixed Amount</SelectItem>
                      <SelectItem value="FLAT" className="text-xs">Flat Rate Formula</SelectItem>
                      <SelectItem value="REDUCING_BALANCE" className="text-xs">Reducing Balance Formula</SelectItem>
                      <SelectItem value="COMPOUND" className="text-xs">Compound Interest Formula</SelectItem>
                      <SelectItem value="CUSTOM" className="text-xs">Custom Schedule-set</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {['FLAT', 'REDUCING_BALANCE', 'COMPOUND'].includes(interestType) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="rate_value" className="text-xs font-semibold text-ink">Rate (%)</Label>
                      <Input
                        id="rate_value"
                        type="number"
                        step="0.01"
                        placeholder="1.5"
                        className="bg-paper border-slate/30 text-ink text-sm"
                        {...register('rate_value')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-ink">Period</Label>
                      <Select onValueChange={(val: string) => setValue('rate_period', val as any)}>
                        <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm">
                          <SelectValue placeholder="Period..." />
                        </SelectTrigger>
                        <SelectContent className="bg-paper border-slate/15 text-ink">
                          <SelectItem value="DAY" className="text-xs">Daily</SelectItem>
                          <SelectItem value="WEEK" className="text-xs">Weekly</SelectItem>
                          <SelectItem value="MONTH" className="text-xs">Monthly</SelectItem>
                          <SelectItem value="YEAR" className="text-xs">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {interestType === 'FIXED' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="fixed_interest_amount" className="text-xs font-semibold text-ink">Amount</Label>
                      <Input
                        id="fixed_interest_amount"
                        type="number"
                        placeholder="1000.00"
                        className="bg-paper border-slate/30 text-ink text-sm"
                        {...register('fixed_interest_amount')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-ink">Frequency</Label>
                      <Select onValueChange={(val: string) => setValue('fixed_interest_frequency', val as any)}>
                        <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm">
                          <SelectValue placeholder="Frequency..." />
                        </SelectTrigger>
                        <SelectContent className="bg-paper border-slate/15 text-ink">
                          <SelectItem value="MONTHLY" className="text-xs">Monthly</SelectItem>
                          <SelectItem value="YEARLY" className="text-xs">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-ink">Interest Timing</Label>
                <Select onValueChange={(val: string) => setValue('interest_timing', val as any)}>
                  <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm">
                    <SelectValue placeholder="Interest timing..." />
                  </SelectTrigger>
                  <SelectContent className="bg-paper border-slate/15 text-ink">
                    <SelectItem value="PAYABLE_PERIODICALLY" className="text-xs">Payable Periodically</SelectItem>
                    <SelectItem value="UPFRONT" className="text-xs">Upfront</SelectItem>
                    <SelectItem value="DEDUCTED_FROM_DISBURSEMENT" className="text-xs">Deducted from Disbursement</SelectItem>
                    <SelectItem value="AT_END" className="text-xs">At the End of Tenure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {interestTiming === 'DEDUCTED_FROM_DISBURSEMENT' && (
                <div className="space-y-1">
                  <Label htmlFor="net_disbursed_amount" className="text-xs font-semibold text-ink">Net Disbursed Amount</Label>
                  <Input
                    id="net_disbursed_amount"
                    type="number"
                    placeholder="90000.00"
                    className="bg-paper border-slate/30 text-ink text-sm"
                    {...register('net_disbursed_amount')}
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Repayment Config */}
          {step === 4 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ink">Repayment Type</Label>
                  <Select onValueChange={(val: string) => setValue('repayment_type', val as any)}>
                    <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm">
                      <SelectValue placeholder="Repayment type..." />
                    </SelectTrigger>
                    <SelectContent className="bg-paper border-slate/15 text-ink">
                      <SelectItem value="ONE_TIME" className="text-xs">One-time Payment</SelectItem>
                      <SelectItem value="EMI" className="text-xs">EMI (Principal + Interest)</SelectItem>
                      <SelectItem value="INTEREST_ONLY" className="text-xs">Interest Only</SelectItem>
                      <SelectItem value="PRINCIPAL_ONLY" className="text-xs">Principal Only</SelectItem>
                      <SelectItem value="FLEXIBLE" className="text-xs">Flexible (Anytime)</SelectItem>
                      <SelectItem value="CUSTOM_INSTALLMENTS" className="text-xs">Custom Installments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {repaymentType !== 'ONE_TIME' && repaymentType !== 'FLEXIBLE' && (
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-ink">Repayment Frequency</Label>
                    <Select onValueChange={(val: string) => setValue('payment_frequency', val as any)}>
                      <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm">
                        <SelectValue placeholder="Frequency..." />
                      </SelectTrigger>
                      <SelectContent className="bg-paper border-slate/15 text-ink">
                        <SelectItem value="WEEKLY" className="text-xs">Weekly</SelectItem>
                        <SelectItem value="BI_WEEKLY" className="text-xs">Bi-weekly</SelectItem>
                        <SelectItem value="MONTHLY" className="text-xs">Monthly</SelectItem>
                        <SelectItem value="QUARTERLY" className="text-xs">Quarterly</SelectItem>
                        <SelectItem value="YEARLY" className="text-xs">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Advance & Penalty */}
          {step === 5 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ink">Advance Payment Mode</Label>
                  <Select onValueChange={(val: string) => setValue('advance_payment_mode', val as any)}>
                    <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm">
                      <SelectValue placeholder="Advance mode..." />
                    </SelectTrigger>
                    <SelectContent className="bg-paper border-slate/15 text-ink">
                      <SelectItem value="CARRY_FORWARD_CREDIT" className="text-xs">Carry Forward Credit</SelectItem>
                      <SelectItem value="RECALCULATE_SCHEDULE" className="text-xs">Recalculate Remaining Schedule</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ink">Grace Period (Days)</Label>
                  <Input
                    type="number"
                    placeholder="3"
                    className="bg-paper border-slate/30 text-ink text-sm"
                    {...register('grace_period_days')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ink">Penalty Type</Label>
                  <Select 
                    value={penaltyType}
                    onValueChange={(val: string) => {
                      setValue('penalty_type', val as any);
                    }}
                  >
                    <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm">
                      <SelectValue placeholder="Penalty type..." />
                    </SelectTrigger>
                    <SelectContent className="bg-paper border-slate/15 text-ink">
                      <SelectItem value="NONE" className="text-xs">No Penalty</SelectItem>
                      <SelectItem value="FIXED" className="text-xs">Fixed Charge</SelectItem>
                      <SelectItem value="PERCENTAGE" className="text-xs">Percentage of Due</SelectItem>
                      <SelectItem value="EXTRA_INTEREST" className="text-xs" disabled={interestType === 'COMPOUND'}>
                        Extra Interest Rate (Blocked if Compound)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {penaltyType !== 'NONE' && (
                  <div className="space-y-1">
                    <Label htmlFor="penalty_value" className="text-xs font-semibold text-ink">Penalty Value</Label>
                    <Input
                      id="penalty_value"
                      type="number"
                      step="0.01"
                      placeholder="2.0"
                      className="bg-paper border-slate/30 text-ink text-sm"
                      {...register('penalty_value')}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 6: Review & Submit */}
          {step === 6 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="border border-slate/15 rounded-md p-4 bg-paper/50 divide-y divide-slate/10 text-xs">
                <div className="grid grid-cols-2 py-2">
                  <span className="text-slate font-medium">Lending Direction</span>
                  <span className="font-bold text-ink">{direction}</span>
                </div>
                <div className="grid grid-cols-2 py-2">
                  <span className="text-slate font-medium">Principal Amount</span>
                  <span className="font-bold font-figures text-ink">
                    {formatCurrency(watch('principal_amount') || 0, 'INR')}
                  </span>
                </div>
                <div className="grid grid-cols-2 py-2">
                  <span className="text-slate font-medium">Start Date</span>
                  <span className="font-bold text-ink">{watch('start_date') || '—'}</span>
                </div>
                <div className="grid grid-cols-2 py-2">
                  <span className="text-slate font-medium">Repayment Timing</span>
                  <span className="font-bold text-ink">{repaymentType}</span>
                </div>
                <div className="grid grid-cols-2 py-2">
                  <span className="text-slate font-medium">Interest Model</span>
                  <span className="font-bold text-ink">{interestType}</span>
                </div>
              </div>
            </div>
          )}

          {/* Form Actions footer */}
          <div className="flex justify-between pt-4 border-t border-slate/15">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={step === 1}
              className="text-xs font-semibold border-slate/30 text-ink hover:bg-slate/5"
            >
              Back
            </Button>
            {step < STEPS.length ? (
              <Button
                type="button"
                onClick={handleNext}
                className="bg-brass hover:bg-brass/90 text-paper font-semibold text-xs py-2 px-4 rounded flex items-center gap-1"
              >
                Continue
                <ArrowRight className="w-4.5 h-4.5" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-brass hover:bg-brass/90 text-paper font-semibold text-xs py-2 px-4 rounded flex items-center gap-1.5 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Recording Draft...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save as Draft
                  </>
                )}
              </Button>
            )}
          </div>
        </form>
      </FormProvider>
    </div>
  );
};
