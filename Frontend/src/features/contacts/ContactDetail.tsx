import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getContact, updateContact, deleteContact, getContactLoans } from '@/api/contacts';
import { contactSchema } from '@/schemas/contact.schema';
import type { ContactInput } from '@/schemas/contact.schema';
import { useSpace } from '@/app/SpaceContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ServerMessage } from '@/components/shared/ServerMessage';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatDate } from '@/lib/formatDate';
import { ArrowLeft, Edit2, Save, Trash2, ShieldAlert, Phone, Mail, MapPin, FileText } from 'lucide-react';
import { toast } from 'sonner';

export const ContactDetail: React.FC = () => {
  const { spaceId, contactId } = useParams<{ spaceId: string; contactId: string }>();
  const parsedSpaceId = Number(spaceId);
  const parsedContactId = Number(contactId);
  
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentRole } = useSpace();

  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<any>(null);

  // Form for Edit Contact
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
  });

  // Query Contact Info
  const { data: contact, isLoading: isLoadingContact } = useQuery({
    queryKey: ['contact', parsedSpaceId, parsedContactId],
    queryFn: async () => {
      const data = await getContact(parsedSpaceId, parsedContactId);
      // Pre-fill form values
      reset(data);
      return data;
    },
    enabled: !isNaN(parsedSpaceId) && !isNaN(parsedContactId),
  });

  // Query Loans for Contact
  const { data: loansData, isLoading: isLoadingLoans } = useQuery({
    queryKey: ['contact-loans', parsedSpaceId, parsedContactId],
    queryFn: () => getContactLoans(parsedSpaceId, parsedContactId),
    enabled: !isNaN(parsedSpaceId) && !isNaN(parsedContactId),
  });

  // Edit Mutation
  const updateMutation = useMutation({
    mutationFn: (data: ContactInput) => updateContact(parsedSpaceId, parsedContactId, data),
    onSuccess: () => {
      toast.success('Contact details updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['contact', parsedSpaceId, parsedContactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts', parsedSpaceId] });
      setIsEditing(false);
      setServerError(null);
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteContact(parsedSpaceId, parsedContactId),
    onSuccess: () => {
      toast.success('Contact deleted from ledger.');
      queryClient.invalidateQueries({ queryKey: ['contacts', parsedSpaceId] });
      navigate(`/spaces/${spaceId}/contacts`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete contact');
    },
  });

  if (isLoadingContact || isLoadingLoans) {
    return <div className="py-24 text-center text-xs font-semibold text-slate animate-pulse">Loading contact data...</div>;
  }

  if (!contact) {
    return (
      <EmptyState
        icon={<ShieldAlert className="w-8 h-8 text-payable" />}
        title="Contact not found"
        description="This counterparty record does not exist or has been removed."
        action={{
          label: 'Back to Contacts',
          onClick: () => navigate(`/spaces/${spaceId}/contacts`),
        }}
      />
    );
  }

  const loans = loansData?.loans || [];
  const netPosition = parseFloat(loansData?.net_position || '0');
  const activeLoansCount = loans.filter((l) => l.status === 'ACTIVE').length;
  
  // Can delete contact if loans list is empty
  const canDelete = loans.length === 0;

  const handleEditSubmit = (data: ContactInput) => {
    setServerError(null);
    updateMutation.mutate(data);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    reset(contact);
  };

  const givenLoans = loans.filter((l) => l.direction === 'GIVEN');
  const takenLoans = loans.filter((l) => l.direction === 'TAKEN');

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Breadcrumbs */}
      <Link
        to={`/spaces/${spaceId}/contacts`}
        className="text-[11px] font-bold text-slate hover:text-ink flex items-center gap-1 w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Contacts Directory
      </Link>

      <div className="flex justify-between items-start flex-wrap gap-4 border-b border-slate/15 pb-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink">{contact.name}</h1>
          <div className="flex gap-1.5 mt-2">
            <Badge variant="outline" className="text-[10px] font-bold border-slate/30 text-ink bg-slate/5 py-0.5">
              {contact.relationship_tag}
            </Badge>
          </div>
        </div>

        {/* Delete Counterparty button */}
        {(currentRole === 'OWNER' || currentRole === 'ADMIN') && (
          <div>
            {!canDelete ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        disabled
                        variant="outline"
                        size="sm"
                        className="text-xs font-semibold border-payable/20 text-payable/50 cursor-not-allowed bg-payable/5"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete Contact
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="bg-ink text-paper border-slate/20 text-xs p-2">
                    <p>Cannot delete: Counterparty has {activeLoansCount} active and {loans.length - activeLoansCount} closed contract(s).</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this contact? This action is permanent.')) {
                    deleteMutation.mutate();
                  }
                }}
                className="text-xs font-semibold border-payable/30 text-payable hover:bg-payable/5"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete Contact
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Net Position Banner */}
      <div
        className={`border rounded-md p-4 flex justify-between items-center flex-wrap gap-4 ${
          netPosition >= 0
            ? 'bg-receivable/5 border-receivable/20 text-receivable'
            : 'bg-payable/5 border-payable/20 text-payable'
        }`}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-wider opacity-90">Net Position Ledger</p>
          <p className="text-[10px] text-slate mt-0.5 font-sans">
            {netPosition >= 0
              ? 'Counterparty owes you this amount in total across active contracts'
              : 'You owe this counterparty in total across active contracts'}
          </p>
        </div>
        <p className="font-serif text-3xl font-bold font-figures">
          {formatCurrency(Math.abs(netPosition), 'INR')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Info Card */}
        <Card className="bg-paper border-slate/15 shadow-none rounded-md md:col-span-1">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate/10">
              <h3 className="font-bold text-xs uppercase tracking-wider text-ink">Contact Details</h3>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-brass hover:underline flex items-center gap-1 font-bold"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSubmit(handleEditSubmit)} className="space-y-4 text-xs">
                <ServerMessage error={serverError} />

                <div className="space-y-1">
                  <Label htmlFor="edit_name" className="font-semibold text-ink">Name</Label>
                  <Input id="edit_name" className="h-8 text-xs bg-paper border-slate/30" {...register('name')} />
                  {errors.name && <p className="text-[10px] text-payable">{errors.name.message as string}</p>}
                </div>

                <div className="space-y-1">
                  <Label className="font-semibold text-ink">Relationship</Label>
                  <Select
                    defaultValue={contact.relationship_tag}
                    onValueChange={(val: any) => setValue('relationship_tag', val)}
                  >
                    <SelectTrigger className="h-8 text-xs bg-paper border-slate/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-paper text-xs">
                      <SelectItem value="BORROWER">Borrower</SelectItem>
                      <SelectItem value="LENDER">Lender</SelectItem>
                      <SelectItem value="PARTNER">Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_phone" className="font-semibold text-ink">Phone</Label>
                  <Input id="edit_phone" className="h-8 text-xs bg-paper border-slate/30" {...register('phone')} />
                  {errors.phone && <p className="text-[10px] text-payable">{errors.phone.message as string}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_email" className="font-semibold text-ink">Email</Label>
                  <Input id="edit_email" className="h-8 text-xs bg-paper border-slate/30" {...register('email')} />
                  {errors.email && <p className="text-[10px] text-payable">{errors.email.message as string}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_address" className="font-semibold text-ink">Address</Label>
                  <Input id="edit_address" className="h-8 text-xs bg-paper border-slate/30" {...register('address')} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_notes" className="font-semibold text-ink">Memo</Label>
                  <Textarea id="edit_notes" className="text-xs bg-paper border-slate/30 min-h-[60px]" {...register('notes')} />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="text-xs h-7 border-slate/30"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={updateMutation.isPending}
                    className="bg-brass text-paper text-xs h-7 font-semibold"
                  >
                    <Save className="w-3.5 h-3.5 mr-1" />
                    Save
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-xs leading-relaxed text-ink/80">
                <div className="flex gap-2.5 items-start">
                  <Phone className="w-4 h-4 text-slate mt-0.5" />
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-slate font-semibold block">Phone</span>
                    <span className="font-mono">{contact.phone || '—'}</span>
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <Mail className="w-4 h-4 text-slate mt-0.5" />
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-slate font-semibold block">Email</span>
                    <span>{contact.email || '—'}</span>
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <MapPin className="w-4 h-4 text-slate mt-0.5" />
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-slate font-semibold block">Address</span>
                    <span>{contact.address || '—'}</span>
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <FileText className="w-4 h-4 text-slate mt-0.5" />
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-slate font-semibold block">Memo</span>
                    <span className="italic block mt-0.5 bg-slate/5 p-2 border border-slate/10 rounded">{contact.notes || 'No remarks recorded.'}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabbed Loans List */}
        <div className="md:col-span-2 space-y-4">
          <Tabs defaultValue="given" className="w-full">
            <div className="flex justify-between items-center border-b border-slate/15 pb-1">
              <TabsList className="bg-slate/5 border border-slate/15 p-0.5 h-auto text-slate flex justify-start rounded-md no-scrollbar">
                <TabsTrigger value="given" className="text-xs font-semibold py-1.5 px-3 rounded-sm data-[state=active]:bg-paper data-[state=active]:text-brass">
                  Given Loans ({givenLoans.length})
                </TabsTrigger>
                <TabsTrigger value="taken" className="text-xs font-semibold py-1.5 px-3 rounded-sm data-[state=active]:bg-paper data-[state=active]:text-brass">
                  Taken Loans ({takenLoans.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="given" className="pt-4">
              <div className="border border-slate/15 rounded-md overflow-hidden bg-paper shadow-sm">
                <table className="w-full text-left text-xs divide-y divide-slate/15">
                  <thead className="bg-ink text-paper uppercase tracking-wider text-[10px] font-semibold">
                    <tr>
                      <th className="py-2 px-4">Loan Link</th>
                      <th className="py-2 text-right">Principal</th>
                      <th className="py-2 text-right">Outstanding</th>
                      <th className="py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate/10 text-ink leading-relaxed">
                    {givenLoans.map((l) => (
                      <tr key={l.id} className="hover:bg-slate/5 transition-colors">
                        <td className="py-2.5 px-4 font-bold">
                          <Link to={`/spaces/${spaceId}/loans/${l.id}`} className="hover:text-brass transition-colors">
                            Contract #{l.id} ({l.interest_type})
                          </Link>
                          <span className="text-[9px] text-slate block font-medium">Started: {formatDate(l.start_date)}</span>
                        </td>
                        <td className="py-2.5 text-right font-figures">{formatCurrency(l.principal_amount, 'INR')}</td>
                        <td className="py-2.5 text-right font-figures font-bold">{formatCurrency(l.outstanding_balance, 'INR')}</td>
                        <td className="py-2.5 text-center">
                          <Badge variant="outline" className={`text-[9px] font-bold ${
                            l.status === 'ACTIVE' ? 'border-brass bg-brass/5 text-brass' : 'border-slate/35 text-slate'
                          }`}>
                            {l.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {givenLoans.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate font-medium text-xs">
                          No given/lent contracts found for this counterparty.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="taken" className="pt-4">
              <div className="border border-slate/15 rounded-md overflow-hidden bg-paper shadow-sm">
                <table className="w-full text-left text-xs divide-y divide-slate/15">
                  <thead className="bg-ink text-paper uppercase tracking-wider text-[10px] font-semibold">
                    <tr>
                      <th className="py-2 px-4">Loan Link</th>
                      <th className="py-2 text-right">Principal</th>
                      <th className="py-2 text-right">Outstanding</th>
                      <th className="py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate/10 text-ink leading-relaxed">
                    {takenLoans.map((l) => (
                      <tr key={l.id} className="hover:bg-slate/5 transition-colors">
                        <td className="py-2.5 px-4 font-bold">
                          <Link to={`/spaces/${spaceId}/loans/${l.id}`} className="hover:text-brass transition-colors">
                            Contract #{l.id} ({l.interest_type})
                          </Link>
                          <span className="text-[9px] text-slate block font-medium">Started: {formatDate(l.start_date)}</span>
                        </td>
                        <td className="py-2.5 text-right font-figures">{formatCurrency(l.principal_amount, 'INR')}</td>
                        <td className="py-2.5 text-right font-figures font-bold">{formatCurrency(l.outstanding_balance, 'INR')}</td>
                        <td className="py-2.5 text-center">
                          <Badge variant="outline" className={`text-[9px] font-bold ${
                            l.status === 'ACTIVE' ? 'border-brass bg-brass/5 text-brass' : 'border-slate/35 text-slate'
                          }`}>
                            {l.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {takenLoans.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate font-medium text-xs">
                          No taken/borrowed contracts found for this counterparty.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
