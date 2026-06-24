from django.db import models
from .spaces import Space, SpaceMember

class CapitalTxnType(models.TextChoices):
    CONTRIBUTION = 'CONTRIBUTION', 'Contribution'
    WITHDRAWAL = 'WITHDRAWAL', 'Withdrawal'


class SpacePartner(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='partners')
    space_member = models.OneToOneField(SpaceMember, on_delete=models.CASCADE, related_name='partner_profile')
    initial_contribution_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    profit_share_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    created_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'space_partners'
        app_label = 'api'


class PartnerCapitalTransaction(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    space_partner = models.ForeignKey(SpacePartner, on_delete=models.CASCADE, related_name='capital_transactions')
    type = models.CharField(max_length=20, choices=CapitalTxnType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    transaction_date = models.DateField()
    note = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'partner_capital_transactions'
        app_label = 'api'
