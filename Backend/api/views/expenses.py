from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from api.models import Expense
from api.serializers import ExpenseSerializer
from api.permissions import IsSpaceMember, CanWrite

def log_activity(space, event_type, entity_type, entity_id, actor_member, description, metadata=None):
    from api.models import ActivityLog
    ActivityLog.objects.create(
        space=space,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_member=actor_member,
        description=description,
        metadata=metadata
    )

class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, IsSpaceMember]

    def get_queryset(self):
        return Expense.objects.filter(space=self.request.space)

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsSpaceMember(), CanWrite()]
        return super().get_permissions()

    def perform_create(self, serializer):
        expense = serializer.save(space=self.request.space, created_by=self.request.space_member)
        log_activity(self.request.space, "EXPENSE_CREATED", "EXPENSE", expense.id, self.request.space_member, f"Expense recorded: {expense.category} of {expense.amount}")

    def perform_update(self, serializer):
        expense = serializer.save()
        log_activity(self.request.space, "EXPENSE_UPDATED", "EXPENSE", expense.id, self.request.space_member, f"Expense #{expense.id} updated")

    def perform_destroy(self, instance):
        log_activity(self.request.space, "EXPENSE_DELETED", "EXPENSE", instance.id, self.request.space_member, f"Expense #{instance.id} deleted")
        instance.delete()

