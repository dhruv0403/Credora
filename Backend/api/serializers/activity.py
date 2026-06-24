from rest_framework import serializers
from api.models import ActivityLog

class ActivityLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor_member.user.display_name', read_only=True)

    class Meta:
        model = ActivityLog
        fields = [
            'id', 'space', 'event_type', 'entity_type', 'entity_id',
            'actor_member', 'actor_name', 'description', 'metadata', 'created_at'
        ]

