from django.db import models
from .spaces import Space, SpaceMember

class DocumentType(models.TextChoices):
    AGREEMENT = 'AGREEMENT', 'Agreement'
    ID_PROOF = 'ID_PROOF', 'Identity Proof'
    PROMISSORY_NOTE = 'PROMISSORY_NOTE', 'Promissory Note'
    RECEIPT = 'RECEIPT', 'Receipt'
    CHEQUE_IMAGE = 'CHEQUE_IMAGE', 'Cheque Image'
    OTHER = 'OTHER', 'Other'

class DocumentEntityType(models.TextChoices):
    LOAN = 'LOAN', 'Loan'
    CONTACT = 'CONTACT', 'Contact'


class Document(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='+')
    entity_type = models.CharField(max_length=20, choices=DocumentEntityType.choices)
    entity_id = models.BigIntegerField()
    document_type = models.CharField(
        max_length=20,
        choices=DocumentType.choices,
        default=DocumentType.OTHER
    )
    file_name = models.CharField(max_length=255)
    storage_path = models.CharField(max_length=500)
    file_size_bytes = models.PositiveIntegerField(null=True, blank=True)
    uploaded_by = models.ForeignKey(SpaceMember, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'documents'
        app_label = 'api'
