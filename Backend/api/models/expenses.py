from django.db import models
from .spaces import Space, SpaceMember
from .loans import Loan

class ExpenseCategory(models.TextChoices):
    DOCUMENTATION = 'DOCUMENTATION', 'Documentation'
    TRAVEL = 'TRAVEL', 'Travel'
    LEGAL = 'LEGAL', 'Legal'
    COLLECTION = 'COLLECTION', 'Collection'
    PROCESSING = 'PROCESSING', 'Processing'
    MISCELLANEOUS = 'MISCELLANEOUS', 'Miscellaneous'


class Expense(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='expenses')
    loan = models.ForeignKey(Loan, null=True, blank=True, on_delete=models.CASCADE, related_name='expenses')
    category = models.CharField(max_length=20, choices=ExpenseCategory.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    expense_date = models.DateField()
    note = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'expenses'
        app_label = 'api'
