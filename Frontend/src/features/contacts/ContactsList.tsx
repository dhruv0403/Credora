import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listContacts, createContact } from '@/api/contacts';
import { contactSchema } from '@/schemas/contact.schema';
import type { ContactInput } from '@/schemas/contact.schema';
import { ResponsiveList } from '@/components/shared/ResponsiveList';
import type { ColumnDef } from '@/components/shared/ResponsiveList';
import { EmptyState } from '@/components/shared/EmptyState';
import { ServerMessage } from '@/components/shared/ServerMessage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Users, UserPlus, Search, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';

export const ContactsList: React.FC = () => {
  const { spaceId } = useParams<{ spaceId: string }>();
  const parsedSpaceId = Number(spaceId);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [serverError, setServerError] = useState<any>(null);

  // Form for New Contact
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      relationship_tag: 'BORROWER',
      phone: '',
      email: '',
      address: '',
      notes: '',
    },
  });

  // Query contacts
  const { data: contacts, isLoading } = useQuery({
    queryKey: ['contacts', parsedSpaceId, searchQuery, tagFilter],
    queryFn: () => listContacts(parsedSpaceId, { search: searchQuery, relationship_tag: tagFilter || undefined }),
    enabled: !isNaN(parsedSpaceId),
  });

  // Mutation to create contact
  const createMutation = useMutation({
    mutationFn: (data: ContactInput) => createContact(parsedSpaceId, data),
    onSuccess: () => {
      toast.success('Contact created successfully!');
      queryClient.invalidateQueries({ queryKey: ['contacts', parsedSpaceId] });
      setIsModalOpen(false);
      reset();
      setServerError(null);
    },
    onError: (err: any) => {
      setServerError(err);
    },
  });

  const onSubmit = (data: ContactInput) => {
    setServerError(null);
    createMutation.mutate(data);
  };

  const openNewContactModal = () => {
    setServerError(null);
    reset();
    setIsModalOpen(true);
  };

  // Define table columns
  const columns: ColumnDef<any>[] = [
    {
      header: 'Name',
      cell: (c) => (
        <Link
          to={`/spaces/${spaceId}/contacts/${c.id}`}
          className="font-bold text-ink hover:text-brass transition-colors"
        >
          {c.name}
        </Link>
      ),
    },
    {
      header: 'Relationship',
      cell: (c) => (
        <Badge variant="outline" className="text-[10px] font-bold border-slate/30 text-ink bg-slate/5 py-0.5">
          {c.relationship_tag}
        </Badge>
      ),
    },
    {
      header: 'Phone',
      cell: (c) => c.phone || '—',
      className: 'font-mono text-xs',
    },
    {
      header: 'Email',
      cell: (c) => c.email || '—',
      className: 'text-xs text-slate',
    },
    {
      header: 'Loans',
      cell: (c) => (
        <span className="font-semibold text-xs text-ink font-figures">
          {c.active_loans_count !== undefined ? c.active_loans_count : '—'} active
        </span>
      ),
      className: 'text-center',
      headerClassName: 'text-center',
    },
  ];

  // Define mobile card layout
  const cardRenderer = (c: any) => (
    <div className="bg-paper border border-slate/15 rounded-md p-4 space-y-3 shadow-sm hover:border-slate/30 transition-colors">
      <div className="flex justify-between items-start">
        <Link
          to={`/spaces/${spaceId}/contacts/${c.id}`}
          className="font-serif text-base font-bold text-ink hover:text-brass"
        >
          {c.name}
        </Link>
        <Badge variant="outline" className="text-[9px] font-bold border-slate/20 text-ink bg-slate/5">
          {c.relationship_tag}
        </Badge>
      </div>

      <div className="space-y-1.5 text-xs text-slate">
        {c.phone && (
          <div className="flex items-center gap-1.5 font-mono">
            <Phone className="w-3.5 h-3.5 text-slate/60" />
            {c.phone}
          </div>
        )}
        {c.email && (
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-slate/60" />
            {c.email}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate/10 flex justify-between items-center text-[10px]">
        <span className="text-slate font-medium">Active Loans:</span>
        <span className="font-bold text-ink font-figures">{c.active_loans_count || 0} contracts</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex justify-between items-center pb-3 border-b border-slate/15">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink">Contacts</h1>
          {/* Signature brass underline tick */}
          <div className="h-0.5 w-8 bg-brass mt-1 rounded-full" />
        </div>
        <Button
          onClick={openNewContactModal}
          className="bg-brass hover:bg-brass/90 text-paper font-semibold text-xs py-2 px-3 rounded flex items-center gap-1.5 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          New Contact
        </Button>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
          <Input
            placeholder="Search contacts by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-paper border-slate/30 text-ink text-sm h-10 w-full"
          />
        </div>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="bg-paper border-slate/30 text-ink text-sm h-10 w-full sm:w-48">
            <SelectValue placeholder="Relationship tag" />
          </SelectTrigger>
          <SelectContent className="bg-paper border-slate/15 text-ink text-xs">
            <SelectItem value="ALL">All tags</SelectItem>
            <SelectItem value="BORROWER">Borrower</SelectItem>
            <SelectItem value="LENDER">Lender</SelectItem>
            <SelectItem value="PARTNER">Partner</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Contact Table list */}
      <ResponsiveList
        data={contacts}
        columns={columns}
        cardRenderer={cardRenderer}
        isLoading={isLoading}
        emptyState={
          <EmptyState
            icon={<Users className="w-8 h-8 text-slate/80" />}
            title="No contacts found"
            description="Start building your ledger database by recording your first counterparty contact details."
            action={{
              label: 'Add Contact',
              onClick: openNewContactModal,
            }}
          />
        }
      />

      {/* Inline Creation Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md bg-paper border border-slate/15 shadow-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg text-ink font-bold">Add New Contact</DialogTitle>
            <DialogDescription className="text-xs text-slate">
              Record a counterparty contact to allocate given or taken loans.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <ServerMessage error={serverError} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="contact_name" className="text-xs font-semibold text-ink">Full Name</Label>
                <Input
                  id="contact_name"
                  placeholder="e.g. John Doe"
                  className="bg-paper border-slate/30 text-ink text-xs h-9"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-[10px] text-payable font-medium">{errors.name.message as string}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-ink">Relationship Tag</Label>
                <Select
                  defaultValue="BORROWER"
                  onValueChange={(val: any) => reset((prev) => ({ ...prev, relationship_tag: val }))}
                >
                  <SelectTrigger className="bg-paper border-slate/30 text-ink text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-paper border-slate/15 text-ink text-xs">
                    <SelectItem value="BORROWER">Borrower</SelectItem>
                    <SelectItem value="LENDER">Lender</SelectItem>
                    <SelectItem value="PARTNER">Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="contact_phone" className="text-xs font-semibold text-ink">Phone Number</Label>
                <Input
                  id="contact_phone"
                  placeholder="+91..."
                  className="bg-paper border-slate/30 text-ink text-xs h-9"
                  {...register('phone')}
                />
                {errors.phone && (
                  <p className="text-[10px] text-payable font-medium">{errors.phone.message as string}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="contact_email" className="text-xs font-semibold text-ink">Email Address</Label>
                <Input
                  id="contact_email"
                  placeholder="name@email.com"
                  className="bg-paper border-slate/30 text-ink text-xs h-9"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-[10px] text-payable font-medium">{errors.email.message as string}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="contact_address" className="text-xs font-semibold text-ink">Physical Address</Label>
              <Input
                id="contact_address"
                placeholder="HQ or Residential address"
                className="bg-paper border-slate/30 text-ink text-xs h-9"
                {...register('address')}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="contact_notes" className="text-xs font-semibold text-ink">Private Memo / Notes</Label>
              <Textarea
                id="contact_notes"
                placeholder="Specific context notes..."
                className="bg-paper border-slate/30 text-ink text-xs min-h-[60px]"
                {...register('notes')}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="text-xs border-slate/30 text-ink hover:bg-slate/5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-brass hover:bg-brass/90 text-paper text-xs font-semibold"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Contact'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
