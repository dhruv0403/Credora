from django.db import models
from .spaces import Space, SpaceMember

class ActivityEntityType(models.TextChoices):
    LOAN = 'LOAN', 'Loan'
    CONTACT = 'CONTACT', 'Contact'
    TRANSACTION = 'TRANSACTION', 'Transaction'
    SPACE_MEMBER = 'SPACE_MEMBER', 'Space Member'
    SPACE = 'SPACE', 'Space'
    EXPENSE = 'EXPENSE', 'Expense'
    SPACE_PARTNER = 'SPACE_PARTNER', 'Space Partner'


class ActivityLog(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    event_type = models.CharField(max_length=60)
    entity_type = models.CharField(max_length=20, choices=ActivityEntityType.choices)
    entity_id = models.BigIntegerField()
    actor_member = models.ForeignKey(
        SpaceMember,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='activity_logs'
    )
    description = models.CharField(max_length=500)
    metadata = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'activity_log'
        app_label = 'api'
        indexes = [
            models.Index(fields=['space', 'created_at']),
            models.Index(fields=['entity_type', 'entity_id']),
        ]
