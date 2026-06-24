from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from api.models import Document
from api.serializers import DocumentSerializer
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

class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated, IsSpaceMember]

    def get_queryset(self):
        qs = Document.objects.filter(space=self.request.space)
        e_type = self.request.query_params.get('entity_type')
        e_id = self.request.query_params.get('entity_id')
        if e_type and e_id:
            qs = qs.filter(entity_type=e_type, entity_id=e_id)
        return qs

    def perform_create(self, serializer):
        doc = serializer.save(space=self.request.space, uploaded_by=self.request.space_member)
        log_activity(self.request.space, "DOCUMENT_UPLOADED", "LOAN" if doc.entity_type == 'LOAN' else "CONTACT", doc.entity_id, self.request.space_member, f"Document {doc.file_name} uploaded")

    def perform_destroy(self, instance):
        log_activity(self.request.space, "DOCUMENT_DELETED", "LOAN" if instance.entity_type == 'LOAN' else "CONTACT", instance.entity_id, self.request.space_member, f"Document {instance.file_name} deleted")
        instance.delete()

