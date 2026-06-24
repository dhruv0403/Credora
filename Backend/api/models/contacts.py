from django.db import models
from .spaces import Space, SpaceMember

class RelationshipTag(models.TextChoices):
    FRIEND = 'FRIEND', 'Friend'
    RELATIVE = 'RELATIVE', 'Relative'
    COLLEAGUE = 'COLLEAGUE', 'Colleague'
    CUSTOMER = 'CUSTOMER', 'Customer'
    VENDOR = 'VENDOR', 'Vendor'
    BANK = 'BANK', 'Bank'
    NBFC = 'NBFC', 'NBFC'
    OTHER = 'OTHER', 'Other'

class Contact(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='contacts')
    name = models.CharField(max_length=160)
    relationship_tag = models.CharField(
        max_length=20,
        choices=RelationshipTag.choices,
        default=RelationshipTag.OTHER
    )
    phone = models.CharField(max_length=20, null=True, blank=True)
    email = models.EmailField(max_length=255, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='contacts_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'contacts'
        app_label = 'api'
        indexes = [
            models.Index(fields=['space']),
        ]

    def __str__(self):
        return self.name
