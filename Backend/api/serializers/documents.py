from rest_framework import serializers
from api.models import Document

class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.user.display_name', read_only=True)

    class Meta:
        model = Document
        fields = [
            'id', 'space', 'entity_type', 'entity_id', 'document_type',
            'file_name', 'storage_path', 'file_size_bytes', 'uploaded_by',
            'uploaded_by_name', 'created_at'
        ]
        read_only_fields = ['id', 'space', 'uploaded_by', 'created_at']

