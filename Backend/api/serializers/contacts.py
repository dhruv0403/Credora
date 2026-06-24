from rest_framework import serializers
from api.models import Contact

class ContactSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.user.display_name', read_only=True)

    class Meta:
        model = Contact
        fields = [
            'id', 'space', 'name', 'relationship_tag', 'phone', 'email',
            'address', 'notes', 'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'space', 'created_by', 'created_at', 'updated_at']

