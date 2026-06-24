from rest_framework import serializers
from api.models import SpaceMember, MemberRole, MemberStatus

class SpaceMemberSerializer(serializers.ModelSerializer):
    user_display_name = serializers.CharField(source='user.display_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = SpaceMember
        fields = [
            'id', 'space', 'user', 'user_display_name', 'user_email',
            'invited_email', 'role', 'status', 'invited_by',
            'joined_at', 'removed_at', 'created_at'
        ]
        read_only_fields = ['id', 'space', 'user', 'invited_by', 'joined_at', 'removed_at', 'created_at']


class InviteMemberSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=MemberRole.choices)

